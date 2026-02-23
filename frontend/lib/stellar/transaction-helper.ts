import * as StellarSdk from '@stellar/stellar-sdk';
import { NetworkType } from '@/types/wallet';
import { getNetworkPassphrase } from './wallet-utils';
import { signTransactionWithFreighter } from './freighter';

/**
 * Helper class for building and submitting Stellar transactions
 */
export class TransactionHelper {
  private server: StellarSdk.Horizon.Server;
  private network: NetworkType;

  constructor(network: NetworkType) {
    this.network = network;
    const horizonUrl =
      network === NetworkType.MAINNET
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
    this.server = new StellarSdk.Horizon.Server(horizonUrl);
  }

  /**
   * Build a payment transaction
   */
  async buildPaymentTransaction(
    sourcePublicKey: string,
    destinationPublicKey: string,
    amount: string,
    assetCode?: string,
    assetIssuer?: string
  ): Promise<StellarSdk.Transaction> {
    const sourceAccount = await this.server.loadAccount(sourcePublicKey);
    const networkPassphrase = getNetworkPassphrase(this.network);

    const asset = assetCode && assetIssuer
      ? new StellarSdk.Asset(assetCode, assetIssuer)
      : StellarSdk.Asset.native();

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.payment({
          destination: destinationPublicKey,
          asset,
          amount,
        })
      )
      .setTimeout(180)
      .build();

    return transaction;
  }

  /**
   * Sign and submit a transaction using Freighter
   */
  async signAndSubmitWithFreighter(
    transaction: StellarSdk.Transaction
  ): Promise<StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse> {
    const xdr = transaction.toXDR();
    const signedXdr = await signTransactionWithFreighter(xdr, this.network);
    
    const signedTransaction = StellarSdk.TransactionBuilder.fromXDR(
      signedXdr,
      getNetworkPassphrase(this.network)
    ) as StellarSdk.Transaction;

    return await this.server.submitTransaction(signedTransaction);
  }

  /**
   * Get account balance
   */
  async getAccountBalance(publicKey: string): Promise<StellarSdk.Horizon.HorizonApi.BalanceLine[]> {
    const account = await this.server.loadAccount(publicKey);
    return account.balances;
  }

  /**
   * Check if account exists
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }
}
