export interface WalletState {
  isConnected: boolean;
  publicKey: string | null;
  balance: string | null;
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
  isLoading: boolean;
  error: string | null;
}

export interface WalletContextType extends WalletState {
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  getBalance: () => Promise<void>;
  connect: (walletType: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => Promise<void>;
}
