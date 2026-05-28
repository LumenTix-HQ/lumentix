'use client';

import { WalletProvider } from '@/contexts/WalletContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
