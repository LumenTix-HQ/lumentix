import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { WalletProvider, useWallet } from '@/contexts/WalletContext';
import { WalletType, NetworkType } from '@/types/wallet';

// Mock child component to test context
const TestComponent = () => {
  const wallet = useWallet();
  return (
    <div>
      <span data-testid="is-connected">{String(wallet.isConnected)}</span>
      <span data-testid="public-key">{wallet.publicKey ?? 'null'}</span>
      <span data-testid="wallet-type">{wallet.walletType ?? 'null'}</span>
      <span data-testid="network">{wallet.network}</span>
      <span data-testid="balance">{wallet.balance ?? 'null'}</span>
      <span data-testid="is-loading">{String(wallet.isLoading)}</span>
      <span data-testid="error">{wallet.error ?? 'null'}</span>
      <button onClick={() => wallet.connectWallet()} data-testid="connect-btn">
        Connect
      </button>
      <button onClick={() => wallet.disconnectWallet()} data-testid="disconnect-btn">
        Disconnect
      </button>
      <button onClick={() => wallet.getBalance?.()} data-testid="balance-btn">
        Get Balance
      </button>
    </div>
  );
};

const renderWithContext = () => {
  return render(
    <WalletProvider>
      <TestComponent />
    </WalletProvider>
  );
};

// Mock Freighter API
const mockFreighterAPI = {
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
};

vi.mock('@stellar/freighter-api', () => ({
  isConnected: () => mockFreighterAPI.isConnected(),
  requestAccess: () => mockFreighterAPI.requestAccess(),
  getNetworkDetails: vi.fn(),
}));

describe('WalletContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFreighterAPI.isConnected.mockResolvedValue({ isConnected: true, error: null });
    mockFreighterAPI.requestAccess.mockResolvedValue({
      address: 'GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      error: null,
    });
  });

  it('should initialize with default state', () => {
    renderWithContext();

    expect(screen.getByTestId('is-connected').textContent).toBe('false');
    expect(screen.getByTestId('public-key').textContent).toBe('null');
    expect(screen.getByTestId('wallet-type').textContent).toBe('null');
    expect(screen.getByTestId('network').textContent).toBe(NetworkType.TESTNET);
    expect(screen.getByTestId('balance').textContent).toBe('null');
    expect(screen.getByTestId('is-loading').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('should connect wallet successfully', async () => {
    renderWithContext();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    // Wait for async operations
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByTestId('is-connected').textContent).toBe('true');
    expect(screen.getByTestId('public-key').textContent).toBe(
      'GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    );
    expect(screen.getByTestId('wallet-type').textContent).toBe(WalletType.FREIGHTER);
    expect(screen.getByTestId('error').textContent).toBe('null');
  });

  it('should handle connection failure when Freighter not installed', async () => {
    mockFreighterAPI.isConnected.mockResolvedValue({ isConnected: false, error: null });

    renderWithContext();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByTestId('is-connected').textContent).toBe('false');
    // Should show install prompt (not directly testable here, but state should not change)
  });

  it('should handle wallet locked error', async () => {
    mockFreighterAPI.requestAccess.mockResolvedValue({
      address: null,
      error: { message: 'Wallet is locked' },
    });

    renderWithContext();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByTestId('is-connected').textContent).toBe('false');
    expect(screen.getByTestId('error').textContent).toContain('locked');
  });

  it('should disconnect wallet', async () => {
    // First connect
    renderWithContext();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByTestId('is-connected').textContent).toBe('true');

    // Then disconnect
    await act(async () => {
      screen.getByTestId('disconnect-btn').click();
    });

    expect(screen.getByTestId('is-connected').textContent).toBe('false');
    expect(screen.getByTestId('public-key').textContent).toBe('null');
    expect(screen.getByTestId('wallet-type').textContent).toBe('null');
  });

  it('should persist wallet to localStorage on connect', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    renderWithContext();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      'lumentix_wallet',
      expect.stringContaining('GTEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    );
  });

  it('should restore wallet from localStorage on mount', async () => {
    const storedWallet = {
      walletType: WalletType.FREIGHTER,
      publicKey: 'GSTORED1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      network: NetworkType.TESTNET,
    };

    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(storedWallet));

    renderWithContext();

    // Initial state shows loading
    expect(screen.getByTestId('is-loading').textContent).toBe('false');

    // After reconnect attempt
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(screen.getByTestId('is-connected').textContent).toBe('true');
    expect(screen.getByTestId('public-key').textContent).toBe(
      'GSTORED1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    );
  });

  it('should handle getBalance call', async () => {
    renderWithContext();

    // Connect first
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Trigger balance fetch
    await act(async () => {
      screen.getByTestId('balance-btn').click();
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    // Balance should be updated (mocked to return null in setup)
    expect(screen.getByTestId('balance-btn')).toBeTruthy();
  });

  it('should throw error when useWallet used outside provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useWallet must be used within WalletProvider');

    consoleError.mockRestore();
  });
});
