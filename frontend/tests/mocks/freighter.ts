import { vi } from 'vitest';

/**
 * Shared mock for `@stellar/freighter-api` (v6 return shapes). One factory is
 * used by tests/setup.ts and the wallet tests so the mocked API surface always
 * matches what the wallet code imports.
 *
 * Usage in a test file:
 *   vi.mock('@stellar/freighter-api', async () => (await import('../mocks/freighter')).freighterModule);
 *   import { freighterMock, resetFreighterMock } from '../mocks/freighter';
 */
export const TEST_PUBLIC_KEY = 'GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

export const freighterMock = {
  isConnected: vi.fn(),
  isAllowed: vi.fn(),
  requestAccess: vi.fn(),
  getNetwork: vi.fn(),
  getNetworkDetails: vi.fn(),
  signTransaction: vi.fn(),
  signMessage: vi.fn(),
};

/** Reset every mock to a healthy, unlocked, TESTNET wallet. */
export function resetFreighterMock(): void {
  freighterMock.isConnected.mockReset().mockResolvedValue({ isConnected: true });
  freighterMock.isAllowed.mockReset().mockResolvedValue({ isAllowed: true });
  freighterMock.requestAccess.mockReset().mockResolvedValue({ address: TEST_PUBLIC_KEY });
  freighterMock.getNetwork
    .mockReset()
    .mockResolvedValue({ network: 'TESTNET', networkPassphrase: TESTNET_PASSPHRASE });
  freighterMock.getNetworkDetails.mockReset().mockResolvedValue({
    network: 'TESTNET',
    networkPassphrase: TESTNET_PASSPHRASE,
    networkUrl: 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  });
  freighterMock.signTransaction
    .mockReset()
    .mockResolvedValue({ signedTxXdr: 'signed-xdr', signerAddress: TEST_PUBLIC_KEY });
  freighterMock.signMessage
    .mockReset()
    .mockResolvedValue({ signedMessage: 'signed-message', signerAddress: TEST_PUBLIC_KEY });
}

resetFreighterMock();

/** The module shape handed to `vi.mock('@stellar/freighter-api', ...)`. */
export const freighterModule = {
  isConnected: (...args: unknown[]) => freighterMock.isConnected(...args),
  isAllowed: (...args: unknown[]) => freighterMock.isAllowed(...args),
  requestAccess: (...args: unknown[]) => freighterMock.requestAccess(...args),
  getNetwork: (...args: unknown[]) => freighterMock.getNetwork(...args),
  getNetworkDetails: (...args: unknown[]) => freighterMock.getNetworkDetails(...args),
  signTransaction: (...args: unknown[]) => freighterMock.signTransaction(...args),
  signMessage: (...args: unknown[]) => freighterMock.signMessage(...args),
};
