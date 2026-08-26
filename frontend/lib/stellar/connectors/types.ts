import { NetworkType, WalletType } from '@/types/wallet';

/**
 * Uniform abstraction implemented by every supported wallet provider
 * (Freighter, LOBSTR, WalletConnect). The rest of the app only ever talks to
 * this interface, so connect/sign/disconnect behave identically regardless of
 * the underlying wallet.
 */
export interface WalletConnector {
  readonly type: WalletType;
  /** Whether the underlying wallet is installed / configured right now. */
  isAvailable(): Promise<boolean>;
  /** Establish a connection and return the account public key. */
  connect(network: NetworkType): Promise<string>;
  /** Sign a base64 transaction XDR, returning the signed XDR. */
  signTransaction(xdr: string, network: NetworkType): Promise<string>;
  /** Tear down any app-side session held by the wallet. */
  disconnect(): Promise<void>;
}

export class WalletConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WalletConnectorError';
  }
}
