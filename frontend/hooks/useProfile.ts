'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

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
  refetch: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
  updateEmailOptOut: (optOut: boolean) => Promise<void>;
  setWalletAddress: (address: string) => void;
  deactivateAccount: () => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMe();
      setProfile({
        ...data,
        walletAddress: data.walletAddress ?? data.stellarPublicKey ?? null,
      });
    } catch (err) {
      // If API is unavailable during development, set a sensible fallback
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Wait for the auth session to resolve before deciding whether to fetch, so a
  // signed-in user doesn't briefly see the "not authenticated" state.
  useEffect(() => {
    if (authLoading) return;
    fetchProfile();
  }, [authLoading, fetchProfile]);

  const updateDisplayName = useCallback(async (displayName: string) => {
    setIsSaving(true);
    try {
      const result = await apiClient.patchMe({ displayName });
      setProfile(prev => prev ? { ...prev, displayName: result.displayName } : prev);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateEmailOptOut = useCallback(async (emailOptOut: boolean) => {
    setIsSaving(true);
    try {
      await apiClient.patchPreferences({ emailOptOut });
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
    await apiClient.deactivateAccount();
  }, []);

  return {
    profile,
    isLoading,
    isSaving,
    error,
    refetch: fetchProfile,
    updateDisplayName,
    updateEmailOptOut,
    setWalletAddress,
    deactivateAccount,
  };
}
