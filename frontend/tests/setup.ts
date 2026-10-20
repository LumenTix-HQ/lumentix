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

// In-memory localStorage that really stores values, so code that round-trips
// through storage can be tested. The methods are spied so tests can still
// assert on calls.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryLocalStorage = new MemoryStorage();
for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
  vi.spyOn(memoryLocalStorage, method);
}

Object.defineProperty(window, 'localStorage', {
  value: memoryLocalStorage,
  configurable: true,
  writable: true,
});

// Start every test with empty storage and fresh call history. (Some tests call
// vi.restoreAllMocks(), which un-spies the methods, hence the optional calls.)
afterEach(() => {
  memoryLocalStorage.clear();
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) {
    (memoryLocalStorage[method] as unknown as { mockClear?: () => void }).mockClear?.();
  }
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
vi.mock('@stellar/freighter-api', async () => (await import('./mocks/freighter')).freighterModule);

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
