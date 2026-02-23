import { isConnected } from '@stellar/freighter-api';
import { NetworkType, WalletType } from '@/types/wallet';

export const WALLET_STORAGE_KEY = 'lumentix_wallet';
export const NETWORK_STORAGE_KEY = 'lumentix_network';

export interface StoredWalletData {
  walletType: WalletType;
  publicKey: string;
  network: NetworkType;
}

export const saveWalletData = (data: StoredWalletData): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(data));
  }
};

export const getStoredWalletData = (): StoredWalletData | null => {
  if (typeof window === 'undefined') return null;
  
  const stored = localStorage.getItem(WALLET_STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

export const clearWalletData = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(WALLET_STORAGE_KEY);
  }
};

export const getNetworkPassphrase = (network: NetworkType): string => {
  return network === NetworkType.MAINNET
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';
};

export const isFreighterInstalled = async (): Promise<boolean> => {
  try {
    const result = await isConnected();
    return result === true;
  } catch {
    return false;
  }
};

export const waitForFreighter = async (timeout = 3000): Promise<boolean> => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const available = await isFreighterInstalled();
      if (available) {
        return true;
      }
    } catch {
      // Continue waiting
    }
    
    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return false;
};
