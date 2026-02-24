import { 
  requestAccess,
  getNetwork, 
  signTransaction,
  isConnected
} from '@stellar/freighter-api';
import { NetworkType } from '@/types/wallet';
import { getNetworkPassphrase } from './wallet-utils';

export class FreighterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FreighterError';
  }
}

export const connectFreighter = async (network: NetworkType): Promise<string> => {
  try {
    // Use requestAccess which handles the full flow
    const publicKey = await requestAccess();
    
    if (!publicKey) {
      throw new FreighterError('Failed to retrieve public key from Freighter');
    }

    // Verify network
    const freighterNetwork = await getNetwork();
    const expectedNetwork = network === NetworkType.MAINNET ? 'PUBLIC' : 'TESTNET';
    
    if (freighterNetwork !== expectedNetwork) {
      throw new FreighterError(
        `Please switch Freighter to ${network} network. Current network: ${freighterNetwork}`
      );
    }

    return publicKey;
  } catch (error) {
    if (error instanceof FreighterError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.message.includes('User declined')) {
        throw new FreighterError('Connection was declined. Please approve the connection request.');
      }
      if (error.message.includes('Freighter is not installed')) {
        throw new FreighterError(
          'Freighter wallet is not installed. Please install it from https://www.freighter.app/'
        );
      }
      throw new FreighterError(`Freighter connection failed: ${error.message}`);
    }
    
    throw new FreighterError('An unknown error occurred while connecting to Freighter');
  }
};

export const signTransactionWithFreighter = async (
  xdr: string,
  network: NetworkType
): Promise<string> => {
  try {
    const networkPassphrase = getNetworkPassphrase(network);
    const signedXdr = await signTransaction(xdr, {
      network: network === NetworkType.MAINNET ? 'PUBLIC' : 'TESTNET',
      networkPassphrase,
    });

    return signedXdr;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('User declined')) {
        throw new FreighterError('Transaction signing was declined by user');
      }
      throw new FreighterError(`Transaction signing failed: ${error.message}`);
    }
    throw new FreighterError('Failed to sign transaction');
  }
};

export const checkFreighterNetwork = async (expectedNetwork: NetworkType): Promise<boolean> => {
  try {
    const freighterNetwork = await getNetwork();
    const expected = expectedNetwork === NetworkType.MAINNET ? 'PUBLIC' : 'TESTNET';
    return freighterNetwork === expected;
  } catch {
    return false;
  }
};

export const isFreighterAvailable = async (): Promise<boolean> => {
  try {
    const result = await isConnected();
    return result === true;
  } catch {
    return false;
  }
};
