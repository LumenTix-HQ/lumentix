# Wallet Integration Setup

## Installation

```bash
cd frontend
npm install
```

This will install the new dependency: `@stellar/freighter-api`

## Verify Installation

Check that the package was installed:

```bash
npm list @stellar/freighter-api
```

Expected output: `@stellar/freighter-api@2.0.0`

## Run the Demo

```bash
npm run dev
```

Then visit: http://localhost:3000/wallet-demo

## File Structure

```
frontend/
├── types/
│   └── wallet.ts                    # TypeScript types
├── contexts/
│   ├── WalletContext.tsx           # Main wallet context
│   └── index.ts                    # Context exports
├── lib/
│   └── stellar/
│       ├── wallet-utils.ts         # Utility functions
│       ├── freighter.ts            # Freighter integration
│       ├── transaction-helper.ts   # Transaction utilities
│       └── index.ts                # Stellar exports
├── hooks/
│   ├── useWalletConnection.ts      # Wallet hook
│   └── index.ts                    # Hook exports
├── components/
│   ├── WalletButton.tsx            # Connect button
│   ├── NetworkSwitcher.tsx         # Network toggle
│   ├── WalletInfo.tsx              # Wallet details
│   └── index.ts                    # Component exports
└── app/
    └── wallet-demo/
        ├── page.tsx                # Demo page
        └── PaymentExample.tsx      # Payment example
```

## Integration Steps

### Step 1: Add WalletProvider to your app

Edit `app/layout.tsx`:

```tsx
import { WalletProvider } from '@/contexts/WalletContext';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
```

### Step 2: Add wallet components to your UI

```tsx
import { WalletButton, NetworkSwitcher } from '@/components';

export default function Navigation() {
  return (
    <nav>
      <NetworkSwitcher />
      <WalletButton />
    </nav>
  );
}
```

### Step 3: Use wallet in your components

```tsx
import { useWallet } from '@/contexts/WalletContext';

export default function TicketPurchase() {
  const { isConnected, publicKey, network } = useWallet();

  if (!isConnected) {
    return <p>Please connect your wallet to purchase tickets</p>;
  }

  return <div>Ready to purchase with {publicKey}</div>;
}
```

## Testing

See `TESTING_CHECKLIST.md` for comprehensive testing procedures.

Quick test:
1. Install Freighter: https://www.freighter.app/
2. Run `npm run dev`
3. Visit http://localhost:3000/wallet-demo
4. Click "Connect Wallet"
5. Approve in Freighter
6. Verify connection persists after page refresh

## Troubleshooting

### Module not found errors
```bash
npm install
```

### TypeScript errors
```bash
npm run build
```

### Freighter not detected
- Install Freighter extension
- Refresh the page
- Check browser console for errors

## Documentation

- **Quick Start**: `WALLET_QUICKSTART.md`
- **Full Guide**: `WALLET_INTEGRATION.md`
- **Testing**: `TESTING_CHECKLIST.md`
- **Summary**: `../WALLET_IMPLEMENTATION_SUMMARY.md`

## Support

For issues:
1. Check the troubleshooting section in `WALLET_INTEGRATION.md`
2. Review Freighter docs: https://docs.freighter.app/
3. Check Stellar docs: https://developers.stellar.org/

## Next Steps

After setup:
1. Run through the testing checklist
2. Integrate into your main application
3. Connect to payment flow (#38)
4. Add to ticket purchase process
