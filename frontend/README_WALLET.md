# 🔐 LumenTix Wallet Integration

Complete Stellar wallet connection system for LumenTix ticketing platform.

## 📋 Overview

This implementation provides a production-ready wallet connection system with:

- ✅ Freighter wallet support
- ✅ Persistent connections
- ✅ Network switching (Testnet/Mainnet)
- ✅ Transaction signing
- ✅ Error handling
- ✅ TypeScript support
- ✅ React Context API
- ⏳ LOBSTR support (coming soon)
- ⏳ WalletConnect support (coming soon)

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Demo

```bash
npm run dev
```

Visit: http://localhost:3000/wallet-demo

### 3. Prerequisites

- Install [Freighter wallet](https://www.freighter.app/)
- Create a Stellar account
- Fund testnet account: https://laboratory.stellar.org/#account-creator

## 📁 Project Structure

```
frontend/
├── types/wallet.ts                 # TypeScript definitions
├── contexts/WalletContext.tsx      # State management
├── lib/stellar/
│   ├── wallet-utils.ts            # Utilities
│   ├── freighter.ts               # Freighter integration
│   └── transaction-helper.ts      # Transaction utilities
├── hooks/useWalletConnection.ts   # Custom hook
├── components/
│   ├── WalletButton.tsx           # Connect UI
│   ├── NetworkSwitcher.tsx        # Network toggle
│   └── WalletInfo.tsx             # Wallet display
└── app/wallet-demo/               # Demo page
```

## 💻 Usage

### Basic Integration

```tsx
// 1. Wrap your app
import { WalletProvider } from '@/contexts/WalletContext';

<WalletProvider>
  <App />
</WalletProvider>

// 2. Use in components
import { useWallet } from '@/contexts/WalletContext';

function MyComponent() {
  const { isConnected, publicKey } = useWallet();
  
  return isConnected ? (
    <p>Connected: {publicKey}</p>
  ) : (
    <p>Not connected</p>
  );
}

// 3. Add UI components
import { WalletButton, NetworkSwitcher } from '@/components';

<header>
  <NetworkSwitcher />
  <WalletButton />
</header>
```

### Advanced Usage

```tsx
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { WalletType } from '@/types/wallet';

function AdvancedComponent() {
  const {
    isConnected,
    publicKey,
    network,
    connectWallet,
    disconnectWallet,
    isConnecting,
    connectionError
  } = useWalletConnection();

  const handleConnect = async () => {
    try {
      await connectWallet(WalletType.FREIGHTER);
      console.log('Connected!');
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  return (
    <div>
      {connectionError && <p>Error: {connectionError}</p>}
      <button onClick={handleConnect} disabled={isConnecting}>
        {isConnecting ? 'Connecting...' : 'Connect'}
      </button>
    </div>
  );
}
```

### Transaction Example

```tsx
import { TransactionHelper } from '@/lib/stellar/transaction-helper';
import { useWallet } from '@/contexts/WalletContext';

function PaymentComponent() {
  const { publicKey, network } = useWallet();

  const sendPayment = async () => {
    const helper = new TransactionHelper(network);
    
    // Build transaction
    const tx = await helper.buildPaymentTransaction(
      publicKey!,
      'GDESTINATION...',
      '10.00'
    );

    // Sign and submit
    const result = await helper.signAndSubmitWithFreighter(tx);
    console.log('Transaction hash:', result.hash);
  };

  return <button onClick={sendPayment}>Send Payment</button>;
}
```

## 🧪 Testing

See `TESTING_CHECKLIST.md` for comprehensive testing procedures.

### Quick Test

```bash
# 1. Start dev server
npm run dev

# 2. Open demo page
open http://localhost:3000/wallet-demo

# 3. Test connection
- Click "Connect Wallet"
- Approve in Freighter
- Verify connection persists after refresh
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| `SETUP.md` | Installation and setup guide |
| `WALLET_QUICKSTART.md` | Quick start guide |
| `WALLET_INTEGRATION.md` | Comprehensive integration guide |
| `ARCHITECTURE.md` | System architecture details |
| `TESTING_CHECKLIST.md` | Testing procedures |

## 🔧 Configuration

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

For mainnet:
```env
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
```

## 🎯 Features

### Implemented ✅

- [x] Freighter wallet connection
- [x] Persistent connection (localStorage)
- [x] Network switching (Testnet/Mainnet)
- [x] Disconnect functionality
- [x] Error handling with user-friendly messages
- [x] Loading states
- [x] TypeScript support
- [x] Transaction signing
- [x] Account balance checking
- [x] Transaction building utilities

### Coming Soon ⏳

- [ ] LOBSTR wallet support
- [ ] WalletConnect integration
- [ ] Hardware wallet support
- [ ] Multi-signature support
- [ ] Transaction history
- [ ] Balance display component

## 🔒 Security

- Private keys never leave the wallet extension
- All transactions signed within wallet
- Network validation prevents wrong-network transactions
- Only public keys stored in localStorage
- No sensitive data transmitted

## 🐛 Troubleshooting

### Wallet won't connect
- Ensure Freighter is installed and unlocked
- Check you're on the correct network
- Clear browser cache and try again

### Connection not persisting
- Check localStorage is enabled
- Verify no browser extensions blocking storage

### Network mismatch
- Open Freighter settings
- Switch to correct network
- Reconnect wallet

See `WALLET_INTEGRATION.md` for more troubleshooting tips.

## 📦 Dependencies

```json
{
  "@stellar/stellar-sdk": "^11.2.2",
  "@stellar/freighter-api": "^2.0.0"
}
```

## 🤝 Contributing

When adding new wallet types:

1. Create integration file in `lib/stellar/`
2. Add wallet type to enum in `types/wallet.ts`
3. Update `WalletContext.connect()` method
4. Enable button in `WalletButton` component
5. Add tests
6. Update documentation

## 📝 API Reference

### WalletContext

```typescript
interface WalletContextType {
  isConnected: boolean;
  publicKey: string | null;
  walletType: WalletType | null;
  network: NetworkType;
  isLoading: boolean;
  error: string | null;
  connect: (walletType: WalletType) => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: NetworkType) => Promise<void>;
}
```

### useWallet Hook

```typescript
const {
  isConnected,
  publicKey,
  walletType,
  network,
  isLoading,
  error,
  connect,
  disconnect,
  switchNetwork
} = useWallet();
```

### useWalletConnection Hook

```typescript
const {
  ...walletState,
  isConnecting,
  connectionError,
  connectWallet,
  disconnectWallet,
  clearError
} = useWalletConnection();
```

## 🎓 Examples

Check out these examples:

- **Basic Connection**: `app/wallet-demo/page.tsx`
- **Payment Transaction**: `app/wallet-demo/PaymentExample.tsx`
- **Transaction Helper**: `lib/stellar/transaction-helper.ts`

## 🔗 Resources

- [Freighter Documentation](https://docs.freighter.app/)
- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK](https://stellar.github.io/js-stellar-sdk/)
- [Horizon API](https://developers.stellar.org/api/horizon)

## 📄 License

Part of the LumenTix project.

## 🙋 Support

For issues or questions:
1. Check the troubleshooting guide
2. Review the documentation
3. Open an issue in the repository

---

**Issue**: #33 - Implement Wallet Connection (Freighter/LOBSTR)  
**Status**: ✅ Complete  
**Related**: #32 (Stellar Integration), #38 (Payment Processing)
