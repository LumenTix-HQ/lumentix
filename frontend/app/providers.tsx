'use client';

import { WalletProvider } from '@/contexts/WalletContext';
import { ToastProvider } from '@/contexts/ToastContext';
import AnalyticsProvider from '@/components/AnalyticsProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <WalletProvider>
        <AnalyticsProvider>
          {children}
        </AnalyticsProvider>
      </WalletProvider>
    </ToastProvider>
  );
}
