import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Horizon,
  Transaction,
  FeeBumpTransaction,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  Operation,
  Asset,
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

  constructor(private readonly configService: ConfigService) {
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

  onModuleDestroy(): void {
    if (this.streamCloser) {
      this.logger.log('Closing Stellar payment stream');
      this.streamCloser();
    }
  }
}
