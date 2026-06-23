'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/contexts/WalletContext";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { WalletButton } from "@/components/WalletButton";
import MobileDrawer from "@/components/MobileDrawer";

interface NavLink {
  name: string;
  href: string;
  requiresAuth?: boolean;
}

const navLinks: NavLink[] = [
  { name: "Events", href: "/events" },
  { name: "Create Event", href: "/create", requiresAuth: true },
  { name: "My Tickets", href: "/profile" },
];

const Navbar = () => {
  const pathname = usePathname();
  const { isConnected } = useWallet();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === href;
    return pathname.startsWith(href);
  };

  const visibleLinks = navLinks.filter(
    (link) => !link.requiresAuth || isConnected
  );

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-300 ${
          isScrolled
            ? "bg-[#060609]/80 backdrop-blur-xl shadow-lg shadow-black/10"
            : "bg-[#060609]/40"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="flex items-center justify-between h-full">
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <span className="text-xl font-bold text-white tracking-tight">
                Lumentix
              </span>
            </Link>

            <div className="hidden md:flex items-center gap-8">
              {visibleLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors hover:text-white ${
                    isActive(link.href)
                      ? "text-white"
                      : "text-gray-400"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-4">
              <NetworkSwitcher />
              <WalletButton />
            </div>

            <button
              onClick={() => setIsDrawerOpen(true)}
              className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <MobileDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        navLinks={visibleLinks}
      />
    </>
  );
}
