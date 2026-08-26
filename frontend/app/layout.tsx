import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { WalletProvider } from "@/contexts/WalletContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { NetworkMismatchBanner } from "@/components/NetworkMismatchBanner";
import ToastContainer from "@/components/Toast";
import { Providers } from "./providers";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

export const metadata: Metadata = {
  title: 'Lumentix – Stellar Event Platform',
  description: 'Decentralized event management platform built on Stellar blockchain',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <WalletProvider>
              <NetworkMismatchBanner />
              <Providers>
                <Navbar />
                {children}
                <ToastContainer />
                <ServiceWorkerRegister />
              </Providers>
            </WalletProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
