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
  networkMismatch: boolean;

  // WalletConnect protocol session methods
  initiate_wallet_connect?: (network?: NetworkType) => Promise<{ uri: string; topic: string; approval: () => Promise<any> }>;
  approve_wallet_session?: (proposalOrApproval?: any) => Promise<{ publicKey: string; topic?: string }>;
  disconnect_wallet?: (topic?: string) => Promise<void>;
  initiateWalletConnect?: (network?: NetworkType) => Promise<{ uri: string; topic: string; approval: () => Promise<any> }>;
  approveWalletSession?: (proposalOrApproval?: any) => Promise<{ publicKey: string; topic?: string }>;
}
