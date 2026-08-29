import { NetworkType, WalletType } from '@/types/wallet';
import { WalletConnector, WalletConnectorError } from './types';
import { getNetworkPassphrase } from '../wallet-utils';

/**
 * Minimal surface of the LOBSTR signer-extension API that we depend on. The
 * LOBSTR browser extension injects an object with this shape onto `window`; we
 * feature-detect it so the bundle never hard-depends on the extension being
 * present, and so tests can inject a mock.
 */
export interface LobstrSignerApi {
  isConnected(): Promise<boolean>;
  getPublicKey(): Promise<string>;
  signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<string>;
}

function resolveLobstrApi(): LobstrSignerApi | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { lobstrSignerApi?: LobstrSignerApi }).lobstrSignerApi ?? null;
}

export class LobstrConnector implements WalletConnector {
  readonly type = WalletType.LOBSTR;

  constructor(private readonly resolve: () => LobstrSignerApi | null = resolveLobstrApi) {}

  private requireApi(): LobstrSignerApi {
    const api = this.resolve();
    if (!api) {
      throw new WalletConnectorError(
        'LOBSTR wallet not detected. Install the LOBSTR signer extension to connect.',
      );
    }
    return api;
  }

  async isAvailable(): Promise<boolean> {
    const api = this.resolve();
    if (!api) return false;
    try {
      return await api.isConnected();
    } catch {
      return false;
    }
  }

  async connect(): Promise<string> {
    const api = this.requireApi();
    const publicKey = await api.getPublicKey();
    if (!publicKey) {
      throw new WalletConnectorError('LOBSTR did not return a public key.');
    }
    return publicKey;
  }

  async signTransaction(xdr: string, network: NetworkType): Promise<string> {
    const api = this.requireApi();
    return api.signTransaction(xdr, { networkPassphrase: getNetworkPassphrase(network) });
  }

  async disconnect(): Promise<void> {
    // The extension keeps no app-side session; disconnect is a no-op.
  }
}
