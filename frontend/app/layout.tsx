import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { WalletProvider } from "@/contexts/WalletContext";
import { NetworkMismatchBanner } from "@/components/NetworkMismatchBanner";
import ToastContainer from "@/components/Toast";
import { Providers } from "./providers";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

export const metadata: Metadata = {
  title: 'Lumentix – Stellar Event Platform',
  description: 'Decentralized event management platform built on Stellar blockchain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>
          <NetworkMismatchBanner />
        <Providers>
          <Navbar />
          {children}
          <ToastContainer />
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  );
}
