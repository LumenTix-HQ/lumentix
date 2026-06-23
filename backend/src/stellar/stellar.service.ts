import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { InsufficientBalanceException } from '../common/exceptions/insufficient-balance.exception';
import {
  Horizon,
  Transaction,
  FeeBumpTransaction,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Asset,
  Memo,
} from '@stellar/stellar-sdk';

export type PaymentCallback = (
  payment: Horizon.ServerApi.PaymentOperationRecord,
) => void;

export interface EscrowKeypair {
  publicKey: string;
  /** Raw secret — caller is responsible for encrypting before storage */
  secret: string;
}

@Injectable()
export class StellarService implements OnModuleDestroy {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: string;
  private streamCloser: (() => void) | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const horizonUrl =
      this.configService.get<string>('stellar.horizonUrl') ??
      'https://horizon-testnet.stellar.org';
    this.networkPassphrase =
      this.configService.get<string>('stellar.networkPassphrase') ??
      'Test SDF Network ; September 2015';

    this.server = new Horizon.Server(horizonUrl);
    this.logger.log(`StellarService initialised → ${horizonUrl}`);
  }

  /**
   * Check connectivity to the Stellar Horizon server (for health checks).
   */
  async checkConnectivity(): Promise<void> {
    await this.server.ledgers().limit(1).call();
  }

  // ─── Existing methods ────────────────────────────────────────────────────

  async getAccount(publicKey: string): Promise<Horizon.AccountResponse> {
    this.logger.debug(`getAccount: ${publicKey}`);
    return this.server.loadAccount(publicKey);
  }

  async submitTransaction(
    xdr: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    this.logger.debug('submitTransaction');
    const tx: Transaction | FeeBumpTransaction = new Transaction(
      xdr,
      this.networkPassphrase,
    );
    return this.server.submitTransaction(tx);
  }

  async getTransaction(
    hash: string,
  ): Promise<Horizon.ServerApi.TransactionRecord> {
    this.logger.debug(`getTransaction: ${hash}`);
    return this.server.transactions().transaction(hash).call();
  }

  extractAndValidateMemo(
    txRecord: Horizon.ServerApi.TransactionRecord,
  ): string {
    const memo =
      typeof txRecord.memo === 'string' ? txRecord.memo.trim() : undefined;

    if (!memo) {
      throw new BadRequestException(
        'Transaction is missing a memo. Cannot correlate with a payment or contribution intent.',
      );
    }

    return memo;
  }

  streamPayments(callback: PaymentCallback): () => void {
    this.logger.debug('streamPayments: opening stream');

    const close = this.server
      .payments()
      .cursor('now')
      .stream({
        onmessage: (payment) => {
          callback(payment as Horizon.ServerApi.PaymentOperationRecord);
        },
        onerror: (error) => {
          this.logger.error('streamPayments error', error);
        },
      });

    this.streamCloser = close;
    return close;
  }

  // ─── Escrow methods ──────────────────────────────────────────────────────

  /**
   * Generate a new Stellar keypair for use as an escrow account.
   * The caller must encrypt `secret` before persisting it.
   */
  generateEscrowKeypair(): EscrowKeypair {
    const keypair = Keypair.random();
    return { publicKey: keypair.publicKey(), secret: keypair.secret() };
  }

  /**
   * Fund a new escrow account using the platform funding account.
   * Submits a createAccount operation from the funder to the new escrow.
   *
   * @param funderSecret  Secret key of the account paying the starting balance
   * @param escrowPublicKey  New account to create
   * @param startingBalance  XLM to seed (minimum 1 XLM on testnet)
   */
  async fundEscrowAccount(
    funderSecret: string,
    escrowPublicKey: string,
    startingBalance: string = '2',
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    this.logger.debug(`fundEscrowAccount: escrow=${escrowPublicKey}`);
    await this.checkPlatformBalance();

    const funderKeypair = Keypair.fromSecret(funderSecret);
    const funderAccount = await this.server.loadAccount(
      funderKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(funderAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.createAccount({
          destination: escrowPublicKey,
          startingBalance,
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(funderKeypair);
    return this.server.submitTransaction(tx);
  }

  /**
   * Release all funds held in an escrow account to the destination wallet
   * and close the escrow account.
   *
   * Transfers every non-native asset balance (e.g. USDC) via individual
   * `payment` operations first, then merges the account to sweep the
   * remaining native XLM balance to the destination.
   *
   * @param escrowSecret  Decrypted secret key of the escrow account
   * @param destination   Recipient's Stellar public key (e.g. organizer wallet)
   */
  async releaseEscrowFunds(
    escrowSecret: string,
    destination: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    this.logger.debug(`releaseEscrowFunds: destination=${destination}`);

    const escrowKeypair = Keypair.fromSecret(escrowSecret);
    const escrowAccount = await this.server.loadAccount(
      escrowKeypair.publicKey(),
    );

    const txBuilder = new TransactionBuilder(escrowAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    // Send each non-native asset balance before merging
    for (const balance of escrowAccount.balances) {
      if (balance.asset_type !== 'native' && parseFloat(balance.balance) > 0) {
        const bal = balance as Horizon.HorizonApi.BalanceLine<
          'credit_alphanum4' | 'credit_alphanum12'
        >;
        txBuilder.addOperation(
          Operation.payment({
            destination,
            asset: new Asset(bal.asset_code, bal.asset_issuer),
            amount: bal.balance,
          }),
        );
      }
    }

    // Merge account to send remaining XLM and close the escrow
    txBuilder.addOperation(Operation.accountMerge({ destination }));

    const tx = txBuilder.setTimeout(30).build();
    tx.sign(escrowKeypair);
    return this.server.submitTransaction(tx);
  }

  async sendPayment(
    escrowSecret: string,
    destination: string,
    amount: string,
    assetCode: string = 'XLM',
    assetIssuer?: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    this.logger.debug(
      `sendPayment: destination=${destination} amount=${amount} asset=${assetCode}`,
    );

    const escrowKeypair = Keypair.fromSecret(escrowSecret);
    const escrowAccount = await this.server.loadAccount(
      escrowKeypair.publicKey(),
    );

    const asset =
      assetCode.toUpperCase() === 'XLM'
        ? Asset.native()
        : new Asset(assetCode, assetIssuer);

    const tx = new TransactionBuilder(escrowAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination,
          asset,
          amount,
        }),
      )
      .setTimeout(30)
      .build();

    tx.sign(escrowKeypair);
    return this.server.submitTransaction(tx);
  }

  /**
   * Get paginated transaction history for a Stellar account.
   * Returns an empty records array for new/unfunded accounts (Horizon 404).
   */
  async getAccountTransactions(
    publicKey: string,
    cursor?: string,
    limit = 10,
  ): Promise<{ records: Horizon.ServerApi.TransactionRecord[] }> {
    try {
      let query = this.server
        .transactions()
        .forAccount(publicKey)
        .limit(limit)
        .order('desc');
      if (cursor) query = query.cursor(cursor);
      return await query.call();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        return { records: [] };
      }
      throw err;
    }
  }

  /**
   * Create and fund a new Stellar keypair via Friendbot (testnet only).
   */
  async createTestnetAccount(
    userId: string,
  ): Promise<{ publicKey: string; secret: string }> {
    if (this.configService.get<string>('STELLAR_NETWORK') !== 'testnet') {
      throw new BadRequestException(
        'Account creation is only available on testnet',
      );
    }
    const keypair = Keypair.random();
    const res = await fetch(
      `https://friendbot.stellar.org?addr=${keypair.publicKey()}`,
    );
    if (!res.ok) {
      throw new InternalServerErrorException('Friendbot funding failed');
    }

    const account = { publicKey: keypair.publicKey(), secret: keypair.secret() };

    // Link account to user profile if userId provided
    if (userId) {
      await this.usersService.updateWallet(userId, account.publicKey);
    }

    return account;
  }

  // ─── Path payment methods ────────────────────────────────────────────────

  /**
   * Find available payment paths via Horizon's strict-receive path-finding API.
   * Returns paths where the destination receives exactly `destAmount` of `destAsset`.
   */
  async findPaymentPath(
    sourcePublicKey: string,
    sourceAssetCode: string,
    destAssetCode: string,
    destAmount: string,
  ): Promise<Horizon.ServerApi.PaymentPathRecord[]> {
    const destAsset =
      destAssetCode.toUpperCase() === 'XLM'
        ? Asset.native()
        : new Asset(destAssetCode, undefined);

    const result = await this.server
      .strictReceivePaths(sourcePublicKey, destAsset, destAmount)
      .call();

    if (!result.records.length) {
      throw new BadRequestException(
        `No payment path found from "${sourceAssetCode}" to "${destAssetCode}" for amount ${destAmount}.`,
      );
    }

    return result.records;
  }

  /**
   * Build a pathPaymentStrictReceive XDR string for the client to sign.
   * Guarantees the destination receives exactly `destAmount` of `destAsset`.
   */
  async buildPathPaymentXdr(params: {
    sourcePublicKey: string;
    sourceAsset: Asset;
    sendMax: string;
    destPublicKey: string;
    destAsset: Asset;
    destAmount: string;
    path: Asset[];
    memo: string;
  }): Promise<string> {
    const sourceAccount = await this.server.loadAccount(params.sourcePublicKey);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.pathPaymentStrictReceive({
          sendAsset: params.sourceAsset,
          sendMax: params.sendMax,
          destination: params.destPublicKey,
          destAsset: params.destAsset,
          destAmount: params.destAmount,
          path: params.path,
        }),
      )
      .addMemo(Memo.text(params.memo))
      .setTimeout(30)
      .build();

    return tx.toXDR();
  }

  /**
   * Merge an escrow account into a destination account.
   * Sends all remaining XLM balance to `destinationPublicKey` and permanently
   * closes the escrow account. Should be called after all refunds succeed.
   *
   * @param escrowSecret          Decrypted secret key of the escrow account
   * @param destinationPublicKey  Platform (or organizer) account to receive residual XLM
   */
  async mergeAccount(
    escrowSecret: string,
    destinationPublicKey: string,
  ): Promise<Horizon.HorizonApi.SubmitTransactionResponse> {
    this.logger.debug(
      `mergeAccount: destination=${destinationPublicKey}`,
    );

    const escrowKeypair = Keypair.fromSecret(escrowSecret);
    const escrowAccount = await this.server.loadAccount(
      escrowKeypair.publicKey(),
    );

    const tx = new TransactionBuilder(escrowAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.accountMerge({ destination: destinationPublicKey }),
      )
      .setTimeout(30)
      .build();

    tx.sign(escrowKeypair);
    return this.server.submitTransaction(tx);
  }

  /**
   * Get the XLM balance of an account.
   */
  async getXlmBalance(publicKey: string): Promise<string> {
    const account = await this.server.loadAccount(publicKey);
    const xlmBalance = account.balances.find(
      (b): b is Horizon.HorizonApi.BalanceLine<'native'> =>
        b.asset_type === 'native',
    );
    return xlmBalance?.balance ?? '0';
  }

  // ─── Platform balance / pre-flight ──────────────────────────────────────

  private static readonly BASE_RESERVE = 0.5;
  private static readonly FEE_BUFFER = 1;

  async getPlatformBalanceInfo(): Promise<{
    available: string;
    reserved: string;
    minimumRequired: string;
  }> {
    const platformPublicKey = this.configService.get<string>(
      'stellar.platformPublicKey',
    );
    if (!platformPublicKey) {
      throw new InternalServerErrorException(
        'Platform public key is not configured',
      );
    }

    const account = await this.server.loadAccount(platformPublicKey);
    const xlmBalance = account.balances.find(
      (b): b is Horizon.HorizonApi.BalanceLine<'native'> =>
        b.asset_type === 'native',
    );

    const total = parseFloat(xlmBalance?.balance ?? '0');
    const subentries = account.subentry_count ?? 0;
    const minimumRequired =
      (subentries + 2) * StellarService.BASE_RESERVE +
      StellarService.FEE_BUFFER;
    const reserved =
      (subentries + 2) * StellarService.BASE_RESERVE;

    return {
      available: total.toFixed(7),
      reserved: reserved.toFixed(7),
      minimumRequired: minimumRequired.toFixed(7),
    };
  }

  async checkPlatformBalance(): Promise<void> {
    const platformPublicKey = this.configService.get<string>(
      'stellar.platformPublicKey',
    );
    if (!platformPublicKey) {
      throw new InternalServerErrorException(
        'Platform public key is not configured',
      );
    }

    const account = await this.server.loadAccount(platformPublicKey);
    const xlmBalance = account.balances.find(
      (b): b is Horizon.HorizonApi.BalanceLine<'native'> =>
        b.asset_type === 'native',
    );

    const total = parseFloat(xlmBalance?.balance ?? '0');
    const subentries = account.subentry_count ?? 0;
    const minimumRequired =
      (subentries + 2) * StellarService.BASE_RESERVE +
      StellarService.FEE_BUFFER;

    if (total < minimumRequired) {
      throw new InsufficientBalanceException(
        total.toFixed(7),
        minimumRequired.toFixed(7),
      );
    }

  /**
   * Transfer a ticket asset to a new owner on the Stellar network.
   *
   * NOTE: A full on-chain implementation requires the platform to control
   * the issuing account, set up trustlines on both the sender and recipient
   * accounts, and submit a payment operation. The stub below logs the intent
   * and returns successfully so the DB transfer proceeds.
   *
   * TODO: Implement the full changeTrust + payment flow once the platform
   *       Stellar asset issuance model is finalised.
   */
  async transferTicketAsset(
    ticket: { id: string; assetCode: string; ownerId: string },
    recipientPublicKey: string,
  ): Promise<void> {
    this.logger.log(
      `transferTicketAsset: ticket=${ticket.id} asset=${ticket.assetCode} ` +
        `from ownerId=${ticket.ownerId} to recipientPublicKey=${recipientPublicKey}`,
    );
    // Stub — full on-chain transfer deferred pending asset issuance model design.
  }

  onModuleDestroy(): void {
    if (this.streamCloser) {
      this.logger.log('Closing Stellar payment stream');
      this.streamCloser();
    }
  }
}
