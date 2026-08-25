import { WalletType } from '@/types/wallet';
import { WalletConnector } from './types';
import { FreighterConnector } from './freighter-connector';
import { LobstrConnector } from './lobstr-connector';
import { WalletConnectConnector } from './walletconnect-connector';

const registry: Record<WalletType, WalletConnector> = {
  [WalletType.FREIGHTER]: new FreighterConnector(),
  [WalletType.LOBSTR]: new LobstrConnector(),
  [WalletType.WALLET_CONNECT]: new WalletConnectConnector(),
};

/** Resolve the connector for a wallet type. Throws for unknown types. */
export function getConnector(type: WalletType): WalletConnector {
  const connector = registry[type];
  if (!connector) {
    throw new Error(`Unsupported wallet type: ${type}`);
  }
  return connector;
}

export * from './types';
export { FreighterConnector } from './freighter-connector';
export { LobstrConnector } from './lobstr-connector';
export type { LobstrSignerApi } from './lobstr-connector';
export {
  WalletConnectConnector,
  registerWalletConnectClient,
} from './walletconnect-connector';
export type { WalletConnectClient } from './walletconnect-connector';
