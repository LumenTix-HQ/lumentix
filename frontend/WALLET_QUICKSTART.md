# Wallet Integration - Quick Start

## Installation

```bash
cd frontend
npm install
```

## Run the Demo

```bash
npm run dev
```

Visit: http://localhost:3000/wallet-demo

## Prerequisites

1. Install Freighter wallet extension: https://www.freighter.app/
2. Create or import a Stellar account
3. For testnet: Get free XLM from https://laboratory.stellar.org/#account-creator

## Basic Usage

### 1. Wrap your app with WalletProvider

```tsx
// app/layout.tsx
import { WalletProvider } from '@/contexts/WalletContext';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

### 2. Add wallet components to your UI

```tsx
import { WalletButton, NetworkSwitcher } from '@/components';

export default function Header() {
  return (
    <header>
      <NetworkSwitcher />
      <WalletButton />
    </header>
  );
}
```

### 3. Use wallet in your components

```tsx
import { useWallet } from '@/contexts/WalletContext';

export default function MyComponent() {
  const { isConnected, publicKey, network } = useWallet();

  if (!isConnected) {
    return <p>Please connect your wallet</p>;
  }

  return (
    <div>
      <p>Connected: {publicKey}</p>
      <p>Network: {network}</p>
    </div>
  );
}
```

## Features Checklist

- ✅ Freighter wallet connection
- ✅ Persistent connection (survives page reload)
- ✅ Network switching (Testnet/Mainnet)
- ✅ Disconnect functionality
- ✅ Error handling with user-friendly messages
- ✅ Loading states
- ✅ TypeScript support
- ⏳ LOBSTR support (coming soon)
- ⏳ WalletConnect support (coming soon)

## Testing Checklist

- [ ] Connect wallet successfully
- [ ] Wallet stays connected after page refresh
- [ ] Switch between Testnet and Mainnet
- [ ] Disconnect wallet
- [ ] Error shown when Freighter not installed
- [ ] Error shown when wallet is locked
- [ ] Error shown on network mismatch

## Common Issues

**Wallet won't connect**
- Make sure Freighter is installed and unlocked
- Check you're on the correct network in Freighter

**Connection not persisting**
- Check browser localStorage is enabled
- Clear cache and try again

**Network mismatch**
- Open Freighter settings and switch to the correct network

## Next Steps

1. Integrate wallet into your ticket purchase flow
2. Add transaction signing for payments
3. Display user balance
4. Add transaction history

See `WALLET_INTEGRATION.md` for detailed documentation.
