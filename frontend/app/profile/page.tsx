'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/hooks/useProfile';
import WalletLinkSection from '@/components/WalletLinkSection';
import { getAnalyticsOptOut, setAnalyticsOptOut } from '@/lib/analytics/analytics';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/[0.06] flex items-center gap-3">
        <span className="text-gray-400">{icon}</span>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs text-gray-500 uppercase tracking-widest mb-1.5 font-medium">
      {children}
    </label>
  );
}

function ReadonlyField({ value }: { value: string }) {
  return (
    <div className="w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07] text-gray-300 text-sm font-mono">
      {value}
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 flex flex-col gap-2 z-[9999] pointer-events-none"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          role="alert"
          className={`pointer-events-auto px-4 py-3 rounded-xl text-sm font-medium shadow-2xl border backdrop-blur-md transition-all animate-in slide-in-from-right-4 duration-300 ${
            t.type === 'success'
              ? 'bg-emerald-900/80 border-emerald-500/40 text-emerald-100'
              : 'bg-red-900/80 border-red-500/40 text-red-100'
          }`}
        >
          <span className="mr-2">{t.type === 'success' ? '✓' : '✕'}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Analytics Opt-Out (from upstream) ────────────────────────────────────────

function AnalyticsOptOut() {
  const [optOut, setOptOut] = useState(false);
  useEffect(() => { setOptOut(getAnalyticsOptOut()); }, []);

  const toggle = () => {
    const next = !optOut;
    setOptOut(next);
    setAnalyticsOptOut(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-white font-medium">Analytics opt-out</div>
          <div className="text-xs text-gray-400 mt-0.5">
            Cookie-free, privacy-respecting usage analytics. Disable to stop all tracking.
          </div>
        </div>
        <button
          id="profile-analytics-optout-toggle"
          onClick={toggle}
          aria-label={optOut ? 'Enable analytics' : 'Disable analytics'}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${optOut ? 'bg-white/10' : 'bg-blue-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${optOut ? 'translate-x-0' : 'translate-x-5'}`} />
        </button>
      </div>
      <p className="text-xs text-gray-600">
        {optOut ? 'Analytics disabled — no data is collected.' : 'Analytics enabled (no cookies set).'}
      </p>
    </div>
  );
}

// ── Deactivate Modal ──────────────────────────────────────────────────────────

function DeactivateModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-[#0f0f14] border border-red-500/30 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-white font-semibold">Deactivate Account</h3>
            <p className="text-xs text-gray-400">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
          Your account and all associated data will be permanently deactivated. Tickets and
          transaction history will be retained per our retention policy.
        </p>
        <div className="mb-4">
          <FieldLabel>
            Type <span className="text-red-400 font-mono">DEACTIVATE</span> to confirm
          </FieldLabel>
          <input
            ref={inputRef}
            id="deactivate-confirm-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="DEACTIVATE"
            className="w-full px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-white text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:border-red-500/50 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <button
            id="deactivate-confirm-btn"
            onClick={onConfirm}
            disabled={input !== 'DEACTIVATE'}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
          >
            Deactivate Account
          </button>
          <button
            id="deactivate-cancel-btn"
            onClick={onCancel}
            className="py-2.5 px-4 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-6">
      <div className="h-32 bg-white/5 rounded-2xl" />
      <div className="h-48 bg-white/5 rounded-2xl" />
      <div className="h-36 bg-white/5 rounded-2xl" />
      <div className="h-32 bg-white/5 rounded-2xl" />
    </div>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────

function AvatarInitials({ name, email }: { name: string | null; email: string }) {
  const raw = name ?? email;
  const initials = raw
    .split(/\s+/)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 via-violet-500 to-pink-500 flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-violet-500/20 border-2 border-white/10 shrink-0">
      {initials || '?'}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const {
    profile,
    isLoading,
    isSaving,
    token,
    updateDisplayName,
    updateEmailOptOut,
    setWalletAddress,
    deactivateAccount,
  } = useProfile();

  // Display name edit state
  const [displayName, setDisplayName] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastCounter = useRef(0);

  // Deactivate modal
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Sync displayName field when profile loads
  useEffect(() => {
    if (profile && !isDirty) {
      setDisplayName(profile.displayName ?? '');
    }
  }, [profile, isDirty]);

  function pushToast(message: string, type: 'success' | 'error') {
    const id = ++toastCounter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  async function handleSaveDisplayName() {
    try {
      await updateDisplayName(displayName);
      setIsDirty(false);
      pushToast('Display name updated!', 'success');
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Failed to save', 'error');
    }
  }

  async function handleToggleEmailOptOut(checked: boolean) {
    try {
      await updateEmailOptOut(checked);
      pushToast(
        checked ? 'Email notifications disabled.' : 'Email notifications enabled.',
        'success',
      );
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Failed to update preference', 'error');
    }
  }

  async function handleDeactivate() {
    setIsDeactivating(true);
    try {
      await deactivateAccount();
      setShowDeactivateModal(false);
      pushToast('Your account has been deactivated.', 'success');
      setTimeout(() => router.push('/'), 2000);
    } catch (e) {
      pushToast(e instanceof Error ? e.message : 'Failed to deactivate account', 'error');
    } finally {
      setIsDeactivating(false);
      setShowDeactivateModal(false);
    }
  }

  // ── Not authenticated ──────────────────────────────────────────────────────
  if (!isLoading && !token) {
    return (
      <main className="min-h-screen pt-24 pb-16 px-4 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Sign in to view your profile</h1>
          <p className="text-sm text-gray-400 mb-6">
            Your profile page is protected. Please connect your wallet or sign in first.
          </p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
          >
            Go to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {showDeactivateModal && (
        <DeactivateModal
          onConfirm={handleDeactivate}
          onCancel={() => setShowDeactivateModal(false)}
        />
      )}
      <ToastStack toasts={toasts} />

      <main className="min-h-screen pt-24 pb-16 px-4">
        <div className="max-w-2xl mx-auto">

          {/* ── Page header ─────────────────────────────────────────────── */}
          <div className="mb-8">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">My Profile</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your account, wallet, and notification preferences.
            </p>
          </div>

          {isLoading ? (
            <ProfileSkeleton />
          ) : (
            <div className="flex flex-col gap-5">

              {/* ── Identity header card ──────────────────────────────── */}
              {profile && (
                <div className="bg-gradient-to-br from-blue-900/20 via-violet-900/10 to-transparent border border-white/[0.08] rounded-2xl px-6 py-5 flex items-center gap-5">
                  <AvatarInitials name={profile.displayName} email={profile.email} />
                  <div className="min-w-0">
                    <div className="text-xl font-bold text-white truncate">
                      {profile.displayName ?? profile.email.split('@')[0]}
                    </div>
                    <div className="text-sm text-gray-400 truncate">{profile.email}</div>
                    {profile.walletAddress && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                        {profile.walletAddress.slice(0, 6)}…{profile.walletAddress.slice(-6)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Account Info ─────────────────────────────────────── */}
              <SectionCard
                title="Account Info"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
              >
                <div className="flex flex-col gap-4">
                  <div>
                    <FieldLabel>Email address</FieldLabel>
                    <ReadonlyField value={profile?.email ?? '—'} />
                    <p className="text-xs text-gray-600 mt-1">Email cannot be changed here.</p>
                  </div>

                  <div>
                    <FieldLabel>Display name</FieldLabel>
                    <div className="flex gap-2">
                      <input
                        id="profile-display-name-input"
                        type="text"
                        value={displayName}
                        onChange={e => {
                          setDisplayName(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="Your display name"
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
                      />
                      <button
                        id="profile-save-name-btn"
                        onClick={handleSaveDisplayName}
                        disabled={!isDirty || isSaving}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shrink-0"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>

                  {profile && (
                    <div className="text-xs text-gray-600">
                      Member since{' '}
                      {new Date(profile.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── Wallet ───────────────────────────────────────────── */}
              <SectionCard
                title="Stellar Wallet"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                }
              >
                <WalletLinkSection
                  linkedAddress={profile?.walletAddress ?? null}
                  token={token}
                  onLinked={setWalletAddress}
                  onToast={pushToast}
                />
              </SectionCard>

              {/* ── Notifications ────────────────────────────────────── */}
              <SectionCard
                title="Notifications"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                }
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-white font-medium">Email notifications</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Receive emails about your events, tickets, and platform updates.
                    </div>
                  </div>
                  {/* Toggle switch */}
                  <button
                    id="profile-email-optout-toggle"
                    role="switch"
                    aria-checked={!(profile?.emailOptOut ?? false)}
                    onClick={() => profile && handleToggleEmailOptOut(!profile.emailOptOut)}
                    disabled={isSaving}
                    className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                      !(profile?.emailOptOut ?? false)
                        ? 'bg-blue-600'
                        : 'bg-white/10'
                    } ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                        !(profile?.emailOptOut ?? false) ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-4">
                  {profile?.emailOptOut
                    ? '⚠ Email notifications are currently disabled.'
                    : '✓ You are subscribed to email notifications.'}
                </p>
              </SectionCard>

              {/* ── Privacy ──────────────────────────────────────────── */}
              <SectionCard
                title="Privacy"
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
              >
                <AnalyticsOptOut />
              </SectionCard>

              {/* ── Danger Zone ──────────────────────────────────────── */}
              <div className="bg-red-950/20 border border-red-500/20 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-red-500/10 flex items-center gap-3">
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
                    Danger Zone
                  </h2>
                </div>
                <div className="px-6 py-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-white font-medium">Deactivate account</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Permanently deactivate your account. This cannot be undone.
                    </div>
                  </div>
                  <button
                    id="profile-deactivate-btn"
                    onClick={() => setShowDeactivateModal(true)}
                    disabled={isDeactivating}
                    className="shrink-0 py-2 px-4 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-400/60 text-sm font-semibold transition-colors"
                  >
                    Deactivate
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </>
  );
}
