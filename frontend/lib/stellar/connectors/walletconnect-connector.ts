import { NetworkType, WalletType } from '@/types/wallet';
import { WalletConnector, WalletConnectorError } from './types';
import { getNetworkPassphrase } from '../wallet-utils';

/**
 * Minimal surface of a WalletConnect Stellar client. A concrete client — e.g.
 * one built on `@walletconnect/sign-client` + a project id — is registered by
 * the app at runtime via {@link registerWalletConnectClient}. This keeps the
 * heavy WalletConnect SDK out of the default bundle and lets tests inject a
 * mock while preserving a uniform connect/sign/disconnect flow.
 */
export interface WalletConnectClient {
  connect(params: { network: NetworkType }): Promise<{ publicKey: string }>;
  signTransaction(params: { xdr: string; networkPassphrase: string }): Promise<{ signedXdr: string }>;
  disconnect(): Promise<void>;
}

let registeredClient: WalletConnectClient | null = null;

/** Register (or clear, with `null`) the concrete WalletConnect client. */
export function registerWalletConnectClient(client: WalletConnectClient | null): void {
  registeredClient = client;
}

export class WalletConnectConnector implements WalletConnector {
  readonly type = WalletType.WALLET_CONNECT;

  constructor(private readonly getClient: () => WalletConnectClient | null = () => registeredClient) {}

  private requireClient(): WalletConnectClient {
    const client = this.getClient();
    if (!client) {
      throw new WalletConnectorError(
        'WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and register a client via registerWalletConnectClient().',
      );
    }
    return client;
  }

  async isAvailable(): Promise<boolean> {
    return this.getClient() != null;
  }

  async connect(network: NetworkType): Promise<string> {
    const { publicKey } = await this.requireClient().connect({ network });
    if (!publicKey) {
      throw new WalletConnectorError('WalletConnect did not return a public key.');
    }
    return publicKey;
  }

  async signTransaction(xdr: string, network: NetworkType): Promise<string> {
    const { signedXdr } = await this.requireClient().signTransaction({
      xdr,
      networkPassphrase: getNetworkPassphrase(network),
    });
    return signedXdr;
  }

  async disconnect(): Promise<void> {
    const client = this.getClient();
    if (client) await client.disconnect();
  }
}
