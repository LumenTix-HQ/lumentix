import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { WalletProvider } from "@/contexts/WalletContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { NetworkMismatchBanner } from "@/components/NetworkMismatchBanner";
import ToastContainer from "@/components/Toast";
import AnalyticsConsentBanner from "@/components/AnalyticsConsentBanner";
import { Providers } from "./providers";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: 'Lumentix – Stellar Event Platform',
  description: 'Decentralized event management platform built on Stellar blockchain',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    // suppressHydrationWarning: the theme script sets data-theme/class on
    // <html> before React hydrates.
    <html lang={locale} data-theme="dark" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
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
        </ThemeProvider>
      </body>
    </html>
  );
}
