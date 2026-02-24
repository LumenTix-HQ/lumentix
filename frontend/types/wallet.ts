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
  connect: (walletType: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => Promise<void>;
}
