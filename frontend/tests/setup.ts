import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
    has: vi.fn(),
  }),
  usePathname: () => '',
}));

// Mock @stellar/freighter-api
vi.mock('@stellar/freighter-api', () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getNetworkDetails: vi.fn(),
  signTransaction: vi.fn(),
}));

// Mock @stellar/stellar-sdk
vi.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: vi.fn().mockImplementation(() => ({
      loadAccount: vi.fn(),
      accounts: vi.fn(),
      transactions: vi.fn(),
    })),
  },
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
  },
  Keypair: {
    fromSecret: vi.fn(),
    random: vi.fn(),
  },
  TransactionBuilder: vi.fn(),
  Operation: {
    payment: vi.fn(),
    accountMerge: vi.fn(),
  },
  BASE_FEE: '100',
}));
