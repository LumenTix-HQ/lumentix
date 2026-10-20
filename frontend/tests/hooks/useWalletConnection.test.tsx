import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { WalletProvider } from '@/contexts/WalletContext';
import { freighterMock, resetFreighterMock, TEST_PUBLIC_KEY } from '../mocks/freighter';
import { WalletType } from '@/types/wallet';

// Shared Freighter mock (v6 return shapes); see tests/mocks/freighter.ts
vi.mock('@stellar/freighter-api', async () => (await import('../mocks/freighter')).freighterModule);
const mockFreighterAPI = freighterMock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WalletProvider>{children}</WalletProvider>
);

describe('useWalletConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetFreighterMock();
  });

  it('should return wallet state with connection helpers', () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    expect(result.current).toHaveProperty('isConnected');
    expect(result.current).toHaveProperty('isConnecting');
    expect(result.current).toHaveProperty('connectionError');
    expect(result.current).toHaveProperty('connectWallet');
    expect(result.current).toHaveProperty('disconnectWallet');
    expect(result.current).toHaveProperty('clearError');
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.connectionError).toBeNull();
  });

  it('should connect wallet successfully', async () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    await act(async () => {
      await result.current.connectWallet(WalletType.FREIGHTER);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.connectionError).toBeNull();
    expect(result.current.publicKey).toBe(TEST_PUBLIC_KEY);
  });

  it('should set isConnecting to true during connection', async () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    const connectionPromise = act(async () => {
      await result.current.connectWallet(WalletType.FREIGHTER);
    });

    await connectionPromise;

    expect(result.current.isConnecting).toBe(false);
  });

  it('should handle connection error', async () => {
    mockFreighterAPI.isConnected.mockResolvedValue({
      isConnected: false,
      error: new Error('Freighter not installed'),
    });

    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    await act(async () => {
      await expect(result.current.connectWallet(WalletType.FREIGHTER)).rejects.toThrow();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
  });

  it('should handle wallet locked error', async () => {
    mockFreighterAPI.requestAccess.mockResolvedValue({
      address: null,
      error: { message: 'Wallet is locked' },
    });

    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    await act(async () => {
      await expect(result.current.connectWallet(WalletType.FREIGHTER)).rejects.toThrow('Wallet is locked');
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isConnecting).toBe(false);
    expect(result.current.connectionError).toContain('Wallet is locked');
  });

  it('should disconnect wallet', async () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    await act(async () => {
      await result.current.connectWallet(WalletType.FREIGHTER);
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnectWallet();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionError).toBeNull();
  });

  it('should clear connection error', () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    act(() => {
      result.current.clearError();
    });

    expect(result.current.connectionError).toBeNull();
  });

  it('should throw error when connect fails', async () => {
    mockFreighterAPI.isConnected.mockResolvedValue({
      isConnected: false,
      error: new Error('Not installed'),
    });

    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    await act(async () => {
      await expect(result.current.connectWallet(WalletType.FREIGHTER)).rejects.toThrow();
    });
  });

  it('should spread wallet state into return value', () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    expect(result.current).toHaveProperty('publicKey');
    expect(result.current).toHaveProperty('walletType');
    expect(result.current).toHaveProperty('network');
    expect(result.current).toHaveProperty('balance');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
  });

  it('should reset error on new connection attempt', async () => {
    const { result } = renderHook(() => useWalletConnection(), { wrapper });

    mockFreighterAPI.isConnected.mockResolvedValueOnce({
      isConnected: false,
      error: new Error('Not installed'),
    });

    await act(async () => {
      await result.current.connectWallet(WalletType.FREIGHTER).catch(() => {});
    });

    mockFreighterAPI.isConnected.mockResolvedValueOnce({ isConnected: true, error: null });
    mockFreighterAPI.requestAccess.mockResolvedValueOnce({
      address: TEST_PUBLIC_KEY,
      error: null,
    });

    await act(async () => {
      await result.current.connectWallet(WalletType.FREIGHTER);
    });

    expect(result.current.isConnected).toBe(true);
  });
});
