import { NetworkType, WalletType } from '@/types/wallet';
import { WalletConnector } from './types';
import {
  connectFreighter,
  signTransactionWithFreighter,
  isFreighterAvailable,
} from '../freighter';

/** Freighter browser-extension connector (the original, fully-supported wallet). */
export class FreighterConnector implements WalletConnector {
  readonly type = WalletType.FREIGHTER;

  isAvailable(): Promise<boolean> {
    return isFreighterAvailable();
  }

  connect(network: NetworkType): Promise<string> {
    return connectFreighter(network);
  }

  signTransaction(xdr: string, network: NetworkType): Promise<string> {
    return signTransactionWithFreighter(xdr, network);
  }

  async disconnect(): Promise<void> {
    // Freighter holds no app-side session; disconnect is a no-op.
  }
}
