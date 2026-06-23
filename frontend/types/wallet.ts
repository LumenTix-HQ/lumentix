export enum WalletType {
  FREIGHTER = 'freighter',
  LOBSTR = 'lobstr',
  WALLET_CONNECT = 'walletconnect',
}

export enum NetworkType {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}

export interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  walletType: WalletType | null;
  network: NetworkType;
  balance: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface WalletContextType extends WalletState {
  connect: (walletType: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => Promise<void>;
  getBalance: () => Promise<void>;
  // legacy aliases kept for backward compat
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}
