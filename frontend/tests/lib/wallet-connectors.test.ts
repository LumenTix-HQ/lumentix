import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NetworkType, WalletType } from '@/types/wallet';
import {
  getConnector,
  LobstrConnector,
  WalletConnectConnector,
  registerWalletConnectClient,
  initiate_wallet_connect,
  approve_wallet_session,
  disconnect_wallet,
  initiateWalletConnect,
  approveWalletSession,
  disconnectWallet,
  type LobstrSignerApi,
  type WalletConnectClient,
} from '@/lib/stellar/connectors';

// Mock the Freighter SDK layer used by FreighterConnector.
vi.mock('@/lib/stellar/freighter', () => ({
  connectFreighter: vi.fn(async () => 'GFREIGHTERPUBLICKEY'),
  signTransactionWithFreighter: vi.fn(async (xdr: string) => `signed:${xdr}`),
  isFreighterAvailable: vi.fn(async () => true),
}));

describe('FreighterConnector', () => {
  it('connects and returns the public key', async () => {
    const c = getConnector(WalletType.FREIGHTER);
    await expect(c.connect(NetworkType.TESTNET)).resolves.toBe('GFREIGHTERPUBLICKEY');
    await expect(c.isAvailable()).resolves.toBe(true);
  });

  it('signs a transaction uniformly', async () => {
    const c = getConnector(WalletType.FREIGHTER);
    await expect(c.signTransaction('XDR', NetworkType.TESTNET)).resolves.toBe('signed:XDR');
  });
});

describe('LobstrConnector', () => {
  let api: LobstrSignerApi;

  beforeEach(() => {
    api = {
      isConnected: vi.fn(async () => true),
      getPublicKey: vi.fn(async () => 'GLOBSTRPUBLICKEY'),
      signTransaction: vi.fn(async (xdr: string) => `lobstr-signed:${xdr}`),
    };
  });

  it('connects and signs when the injected signer is available', async () => {
    const c = new LobstrConnector(() => api);
    await expect(c.isAvailable()).resolves.toBe(true);
    await expect(c.connect()).resolves.toBe('GLOBSTRPUBLICKEY');
    await expect(c.signTransaction('XDR', NetworkType.MAINNET)).resolves.toBe('lobstr-signed:XDR');
    expect(api.signTransaction).toHaveBeenCalledWith('XDR', {
      networkPassphrase: 'Public Global Stellar Network ; September 2015',
    });
  });

  it('throws a clear error when the LOBSTR extension is absent', async () => {
    const c = new LobstrConnector(() => null);
    await expect(c.isAvailable()).resolves.toBe(false);
    await expect(c.connect()).rejects.toThrow(/LOBSTR wallet not detected/);
  });
});

describe('WalletConnectConnector', () => {
  let client: WalletConnectClient;

  beforeEach(() => {
    client = {
      connect: vi.fn(async () => ({ publicKey: 'GWALLETCONNECTKEY' })),
      signTransaction: vi.fn(async ({ xdr }) => ({ signedXdr: `wc-signed:${xdr}` })),
      disconnect: vi.fn(async () => {}),
    };
    registerWalletConnectClient(null);
  });

  it('connects, signs and disconnects with an injected client', async () => {
    const c = new WalletConnectConnector(() => client);
    await expect(c.isAvailable()).resolves.toBe(true);
    await expect(c.connect(NetworkType.TESTNET)).resolves.toBe('GWALLETCONNECTKEY');
    await expect(c.signTransaction('XDR', NetworkType.TESTNET)).resolves.toBe('wc-signed:XDR');
    await c.disconnect();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('throws a clear error when no client is configured', async () => {
    const c = new WalletConnectConnector(() => null);
    await expect(c.isAvailable()).resolves.toBe(false);
    await expect(c.connect(NetworkType.TESTNET)).rejects.toThrow(/WalletConnect is not configured/);
  });

  it('can be registered globally and resolved via registerWalletConnectClient', async () => {
    registerWalletConnectClient(client);
    const c = new WalletConnectConnector();
    await expect(c.connect(NetworkType.TESTNET)).resolves.toBe('GWALLETCONNECTKEY');
    registerWalletConnectClient(null);
  });

  it('initiates wallet connect session with URI and topic', async () => {
    const c = new WalletConnectConnector(() => client);
    const proposal = await c.initiate_wallet_connect(NetworkType.TESTNET);
    expect(proposal.uri).toContain('wc:');
    expect(proposal.topic).toBeTruthy();
    expect(typeof proposal.approval).toBe('function');
  });

  it('approves wallet session successfully', async () => {
    const c = new WalletConnectConnector(() => client);
    const proposal = await c.initiate_wallet_connect(NetworkType.TESTNET);
    const approved = await c.approve_wallet_session(proposal);
    expect(approved.publicKey).toBe('GWALLETCONNECTKEY');
  });

  it('disconnects active wallet session cleanly', async () => {
    const c = new WalletConnectConnector(() => client);
    await c.disconnect_wallet('mock-topic');
    expect(client.disconnect).toHaveBeenCalledWith({ topic: 'mock-topic' });
  });

  it('supports top-level initiate_wallet_connect, approve_wallet_session, and disconnect_wallet', async () => {
    registerWalletConnectClient(client);
    const proposal = await initiate_wallet_connect(NetworkType.TESTNET);
    expect(proposal.uri).toContain('wc:');

    const approved = await approve_wallet_session(proposal);
    expect(approved.publicKey).toBe('GWALLETCONNECTKEY');

    await disconnect_wallet('test-topic');
    expect(client.disconnect).toHaveBeenCalled();

    // Also check camelCase aliases
    const prop2 = await initiateWalletConnect(NetworkType.MAINNET);
    expect(prop2.uri).toContain('wc:');
    const app2 = await approveWalletSession(prop2);
    expect(app2.publicKey).toBe('GWALLETCONNECTKEY');
    await disconnectWallet();

    registerWalletConnectClient(null);
  });
});
