"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { WalletButton } from "@/components/WalletButton";

interface NavLink {
  name: string;
  href: string;
}

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  navLinks: NavLink[];
  isAuthenticated?: boolean;
  user?: { email?: string | null; role?: string | null } | null;
  onLogout?: () => void;
}

const MobileDrawer = ({ isOpen, onClose, navLinks, isAuthenticated, user, onLogout }: MobileDrawerProps) => {
  const pathname = usePathname();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <div
        className={`fixed top-0 right-0 z-50 h-full w-72 bg-[#060609] border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <span className="text-lg font-bold text-white">Menu</span>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "text-white bg-white/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {link.name}
            </Link>
          ))}
          {isAuthenticated && (
            <Link
              href="/profile"
              onClick={onClose}
              className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive("/profile")
                  ? "text-white bg-white/10"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              Profile
            </Link>
          )}
        </div>

        <div className="p-4 border-t border-white/10 space-y-3">
          {isAuthenticated ? (
            <>
              <div className="px-4 py-2 rounded-lg bg-white/5">
                <p className="text-sm text-white font-medium truncate">{user?.email}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={() => { onLogout?.(); onClose(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <div className="flex gap-2">
              <Link
                href="/login"
                onClick={onClose}
                className="flex-1 text-center px-3 py-2 text-sm font-medium text-gray-300 hover:text-white border border-white/10 rounded-lg transition-colors"
              >
                Log in
              </Link>
              <Link
                href="/register"
                onClick={onClose}
                className="flex-1 text-center px-3 py-2 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                Sign up
              </Link>
            </div>
          )}
          <NetworkSwitcher />
          <WalletButton />
        </div>
      </div>
    </>
  );
};

export default MobileDrawer;
