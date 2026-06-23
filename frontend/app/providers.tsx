'use client';

import { WalletProvider } from '@/contexts/WalletContext';
import { ToastProvider } from '@/contexts/ToastContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WalletProvider>{children}</WalletProvider>
    </ToastProvider>
import { NetworkMismatchBanner } from '@/components/NetworkMismatchBanner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      {/* WCAG 2.1: polite live region for dynamic announcements */}
      <div
        id="a11y-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <NetworkMismatchBanner />
      {children}
    </WalletProvider>
  );
}
