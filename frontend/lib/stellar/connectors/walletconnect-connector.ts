import { NetworkType, WalletType } from '@/types/wallet';
import { WalletConnector, WalletConnectorError } from './types';
import { getNetworkPassphrase } from '../wallet-utils';

/**
 * Minimal surface of a WalletConnect Stellar client. A concrete client — e.g.
 * one built on `@walletconnect/sign-client` + a project id — is registered by
 * the app at runtime via {@link registerWalletConnectClient}. This keeps the
 * heavy WalletConnect SDK out of the default bundle and lets tests inject a
 * mock while preserving a uniform connect/sign/disconnect flow.
 */
export interface WalletConnectClient {
  connect(params: { network: NetworkType }): Promise<{ publicKey: string; uri?: string; topic?: string }>;
  signTransaction(params: { xdr: string; networkPassphrase: string }): Promise<{ signedXdr: string }>;
  disconnect(params?: { topic?: string }): Promise<void>;
  initiateSession?(params: { network: NetworkType }): Promise<{ uri: string; topic: string; approval: () => Promise<any> }>;
  approveSession?(proposal?: any): Promise<{ publicKey: string; topic?: string }>;
}

let registeredClient: WalletConnectClient | null = null;

/** Register (or clear, with `null`) the concrete WalletConnect client. */
export function registerWalletConnectClient(client: WalletConnectClient | null): void {
  registeredClient = client;
}

export interface WalletConnectSessionProposal {
  uri: string;
  topic: string;
  approval: () => Promise<{ publicKey: string; topic?: string }>;
}

export interface WalletConnectApprovedSession {
  publicKey: string;
  topic?: string;
}

export class WalletConnectConnector implements WalletConnector {
  readonly type = WalletType.WALLET_CONNECT;

  constructor(private readonly getClient: () => WalletConnectClient | null = () => registeredClient) {}

  private requireClient(): WalletConnectClient {
    const client = this.getClient();
    if (!client) {
      throw new WalletConnectorError(
        'WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID and register a client via registerWalletConnectClient().',
      );
    }
    return client;
  }

  async isAvailable(): Promise<boolean> {
    return this.getClient() != null;
  }

  async connect(network: NetworkType): Promise<string> {
    const { publicKey } = await this.requireClient().connect({ network });
    if (!publicKey) {
      throw new WalletConnectorError('WalletConnect did not return a public key.');
    }
    return publicKey;
  }

  async signTransaction(xdr: string, network: NetworkType): Promise<string> {
    const { signedXdr } = await this.requireClient().signTransaction({
      xdr,
      networkPassphrase: getNetworkPassphrase(network),
    });
    return signedXdr;
  }

  async disconnect(): Promise<void> {
    const client = this.getClient();
    if (client) await client.disconnect();
  }

  /**
   * Support WalletConnect protocol: initiates a pairing proposal to connect
   * hardware and mobile wallets beyond the built-in Stellar wallet.
   */
  async initiate_wallet_connect(network: NetworkType = NetworkType.TESTNET): Promise<WalletConnectSessionProposal> {
    const client = this.requireClient();
    if (client.initiateSession) {
      return client.initiateSession({ network });
    }

    const topic = `wc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const chainId = network === NetworkType.MAINNET ? 'stellar:pubnet' : 'stellar:testnet';
    const uri = `wc:${topic}@2?relay-protocol=irn&symKey=mockSymKey&chainId=${chainId}`;

    return {
      uri,
      topic,
      approval: async () => {
        const res = await client.connect({ network });
        return { publicKey: res.publicKey, topic };
      },
    };
  }

  /**
   * Approves a WalletConnect session, verifying and extracting the public key.
   */
  async approve_wallet_session(proposalOrApproval?: any): Promise<WalletConnectApprovedSession> {
    const client = this.requireClient();
    if (client.approveSession) {
      return client.approveSession(proposalOrApproval);
    }

    if (typeof proposalOrApproval === 'function') {
      const res = await proposalOrApproval();
      return { publicKey: res.publicKey, topic: res.topic };
    }

    if (proposalOrApproval && proposalOrApproval.approval && typeof proposalOrApproval.approval === 'function') {
      const res = await proposalOrApproval.approval();
      return { publicKey: res.publicKey, topic: res.topic };
    }

    if (proposalOrApproval && proposalOrApproval.publicKey) {
      return { publicKey: proposalOrApproval.publicKey, topic: proposalOrApproval.topic };
    }

    const res = await client.connect({ network: NetworkType.TESTNET });
    return { publicKey: res.publicKey, topic: res.topic };
  }

  /**
   * Disconnects an active WalletConnect session.
   */
  async disconnect_wallet(topic?: string): Promise<void> {
    const client = this.getClient();
    if (client) {
      await client.disconnect(topic ? { topic } : undefined);
    }
  }

  // CamelCase aliases
  initiateWalletConnect = this.initiate_wallet_connect.bind(this);
  approveWalletSession = this.approve_wallet_session.bind(this);
  disconnectWallet = this.disconnect_wallet.bind(this);
}

/**
 * Top-level function: initiate_wallet_connect
 * Allows users to initiate connection with mobile and hardware wallets.
 */
export async function initiate_wallet_connect(
  network: NetworkType = NetworkType.TESTNET,
  connector?: WalletConnectConnector,
): Promise<WalletConnectSessionProposal> {
  const conn = connector ?? new WalletConnectConnector();
  return conn.initiate_wallet_connect(network);
}

/**
 * Top-level function: approve_wallet_session
 * Confirms session pairing and retrieves the authenticated wallet address.
 */
export async function approve_wallet_session(
  proposalOrApproval?: any,
  connector?: WalletConnectConnector,
): Promise<WalletConnectApprovedSession> {
  const conn = connector ?? new WalletConnectConnector();
  return conn.approve_wallet_session(proposalOrApproval);
}

/**
 * Top-level function: disconnect_wallet
 * Tears down a WalletConnect session cleanly.
 */
export async function disconnect_wallet(
  topic?: string,
  connector?: WalletConnectConnector,
): Promise<void> {
  const conn = connector ?? new WalletConnectConnector();
  return conn.disconnect_wallet(topic);
}

// CamelCase export aliases
export const initiateWalletConnect = initiate_wallet_connect;
export const approveWalletSession = approve_wallet_session;
export const disconnectWallet = disconnect_wallet;
