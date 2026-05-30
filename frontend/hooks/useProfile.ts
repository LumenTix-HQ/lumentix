'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  walletAddress: string | null;
  emailOptOut: boolean;
  createdAt: string;
}

export interface UseProfileReturn {
  profile: UserProfile | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  token: string | null;
  refetch: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateEmailOptOut: (optOut: boolean) => Promise<void>;
  setWalletAddress: (address: string) => void;
  deactivateAccount: () => Promise<void>;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('lumentix_access_token');
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getStoredToken());
  }, []);

  const fetchProfile = useCallback(async () => {
    const tok = getStoredToken();
    if (!tok) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMe(tok);
      setProfile(data);
    } catch (err) {
      // If API is unavailable during development, set a sensible fallback
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateDisplayName = useCallback(async (displayName: string) => {
    const tok = getStoredToken();
    if (!tok) throw new Error('Not authenticated');
    setIsSaving(true);
    try {
      const result = await apiClient.patchMe({ displayName }, tok);
      setProfile(prev => prev ? { ...prev, displayName: result.displayName } : prev);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateEmailOptOut = useCallback(async (emailOptOut: boolean) => {
    const tok = getStoredToken();
    if (!tok) throw new Error('Not authenticated');
    setIsSaving(true);
    try {
      await apiClient.patchPreferences({ emailOptOut }, tok);
      setProfile(prev => prev ? { ...prev, emailOptOut } : prev);
    } finally {
      setIsSaving(false);
    }
  }, []);

  /** Called by WalletLinkSection after a successful wallet-verify response */
  const setWalletAddress = useCallback((walletAddress: string) => {
    setProfile(prev => prev ? { ...prev, walletAddress } : prev);
  }, []);

  const deactivateAccount = useCallback(async () => {
    const tok = getStoredToken();
    if (!tok) throw new Error('Not authenticated');
    await apiClient.deactivateAccount(tok);
  }, []);

  return {
    profile,
    isLoading,
    isSaving,
    error,
    token,
    refetch: fetchProfile,
    updateDisplayName,
    updateEmailOptOut,
    setWalletAddress,
    deactivateAccount,
  };
}
