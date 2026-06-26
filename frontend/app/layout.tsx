import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { Providers } from "./providers";
import ToastContainer from "@/components/Toast";

export const metadata: Metadata = {
  title: 'Lumentix – Stellar Event Platform',
  description: 'Decentralized event management platform built on Stellar blockchain',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <Navbar />
          {children}
          <ToastContainer />
        </Providers>
      </body>
    </html>
  );
}
