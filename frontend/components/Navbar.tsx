'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/contexts/WalletContext';
import { WalletType } from '@/types/wallet';

const NAV_LINKS = [
  { name: 'Events', href: '/events' },
  { name: 'Create', href: '/create' },
  { name: 'Insurance', href: '/insurance' },
  { name: 'Reviews', href: '/reviews' },
  { name: 'Achievements', href: '/gamification' },
  { name: 'Profile', href: '/profile' },
];

function truncate(key: string) {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export default function Navbar() {
  const pathname = usePathname();
  const { isConnected, publicKey, isLoading, connect, disconnect } = useWallet();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
      {/* Logo */}
      <Link href="/" className="text-white font-bold text-lg tracking-tight">
        Lumentix
      </Link>

      {/* Links */}
      <div className="hidden md:flex items-center gap-1 px-4 py-2 bg-white/[0.06] backdrop-blur-md rounded-full border border-white/[0.1]">
        {NAV_LINKS.map(link => (
          <Link
            key={link.name}
            href={link.href}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              pathname === link.href
                ? 'bg-white/[0.12] text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {link.name}
          </Link>
        ))}
      </div>

      {/* Wallet */}
      <div className="flex items-center gap-2">
        {isConnected && publicKey ? (
          <div className="flex items-center gap-2">
            <span className="hidden sm:block text-xs text-gray-400 font-mono bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/[0.08]">
              {truncate(publicKey)}
            </span>
            <button
              onClick={disconnect}
              className="text-xs text-gray-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-full border border-white/[0.08] hover:border-red-500/30"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => connect(WalletType.FREIGHTER)}
            disabled={isLoading}
            className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60 px-4 py-2 rounded-full transition-colors"
          >
            {isLoading ? 'Connecting…' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </nav>
  );
}
