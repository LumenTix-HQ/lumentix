import {
  Account,
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

export class StellarService {
  private server: Horizon.Server;
  private networkPassphrase: string;

  constructor(useTestnet: boolean = true) {
    this.server = new Horizon.Server(
      useTestnet
        ? "https://horizon-testnet.stellar.org"
        : "https://horizon.stellar.org",
    );
    this.networkPassphrase = useTestnet ? Networks.TESTNET : Networks.PUBLIC;
  }

  async loadAccount(publicKey: string): Promise<Account> {
    return await this.server.loadAccount(publicKey);
  }

  async buildPaymentTransaction(
    sourceSecretKey: string,
    destinationAddress: string,
    amount: string,
    memo?: string,
  ) {
    const keypair = Keypair.fromSecret(sourceSecretKey);
    const sourceAccount = await this.loadAccount(keypair.publicKey());

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    }).addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount,
      }),
    );

    if (memo) {
      transaction.addMemo(Horizon.Memo.text(memo));
    }

    return transaction.setTimeout(30).build();
  }

  signTransaction(transaction: any, secretKey: string): any {
    const keypair = Keypair.fromSecret(secretKey);
    transaction.sign(keypair);
    return transaction;
  }

  async submitTransaction(transaction: any) {
    try {
      const result = await this.server.submitTransaction(transaction);
      return {
        success: true,
        hash: result.hash,
        result: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: error,
      };
    }
  }

  async getTransaction(transactionId: string) {
    try {
      const transaction = await this.server
        .transactions()
        .transaction(transactionId);
      return {
        success: true,
        transaction,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getAccountBalance(publicKey: string) {
    try {
      const account = await this.loadAccount(publicKey);
      const balances = account.balances.map((balance: any) => ({
        asset_type: balance.asset_type,
        asset_code: balance.asset_code,
        asset_issuer: balance.asset_issuer,
        balance: balance.balance,
      }));

      return {
        success: true,
        balances,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async fundTestnetAccount(publicKey: string) {
    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${publicKey}`,
      );
      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          result,
        };
      } else {
        throw new Error("Failed to fund account");
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  validateAddress(address: string): boolean {
    try {
      Keypair.fromPublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  validateSecretKey(secretKey: string): boolean {
    try {
      Keypair.fromSecret(secretKey);
      return true;
    } catch {
      return false;
    }
  }
}

export const stellarService = new StellarService(true); // Default to testnet
