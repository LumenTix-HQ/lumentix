# Wallet Integration Guide

This document describes the wallet connection system implemented for LumenTix.

## Features

✅ Freighter wallet integration
✅ Persistent wallet connection across page reloads
✅ Network switching (Testnet/Mainnet)
✅ Graceful error handling
✅ Loading states
✅ TypeScript support
✅ React Context API for state management

## Architecture

### Core Components

1. **WalletContext** (`contexts/WalletContext.tsx`)
   - Central state management for wallet connection
   - Handles connection persistence via localStorage
   - Provides connect, disconnect, and switchNetwork methods

2. **WalletButton** (`components/WalletButton.tsx`)
   - Main UI component for wallet connection
   - Displays connection status and wallet menu
   - Shows formatted public key when connected

3. **NetworkSwitcher** (`components/NetworkSwitcher.tsx`)
   - Toggle between Testnet and Mainnet
   - Validates network on wallet reconnection
   - Shows warning when on Mainnet

4. **WalletInfo** (`components/WalletInfo.tsx`)
   - Displays detailed wallet information
   - Shows wallet type, network, and full public key

### Utilities

- **wallet-utils.ts** - Storage helpers and network utilities
- **freighter.ts** - Freighter-specific connection logic
- **useWalletConnection.ts** - Custom hook for wallet operations

## Installation

```bash
cd frontend
npm install
```

The following dependency has been added:
- `@stellar/freighter-api`: ^2.0.0

## Usage

### Basic Setup

Wrap your app with the WalletProvider:

```tsx
import { WalletProvider } from '@/contexts/WalletContext';

export default function App() {
  return (
    <WalletProvider>
      {/* Your app components */}
    </WalletProvider>
  );
}
```

### Using the Wallet Hook

```tsx
import { useWallet } from '@/contexts/WalletContext';

function MyComponent() {
  const { isConnected, publicKey, connect, disconnect } = useWallet();

  return (
    <div>
      {isConnected ? (
        <p>Connected: {publicKey}</p>
      ) : (
        <button onClick={() => connect(WalletType.FREIGHTER)}>
          Connect
        </button>
      )}
    </div>
  );
}
```

### Using Pre-built Components

```tsx
import { WalletButton } from '@/components/WalletButton';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';

function Header() {
  return (
    <header>
      <NetworkSwitcher />
      <WalletButton />
    </header>
  );
}
```

## Testing

### Prerequisites

1. Install Freighter wallet extension:
   - Chrome/Brave: https://chrome.google.com/webstore
   - Firefox: https://addons.mozilla.org/firefox
   - Or visit: https://www.freighter.app/

2. Create or import a Stellar account in Freighter

### Test the Demo Page

```bash
npm run dev
```

Navigate to: http://localhost:3000/wallet-demo

### Test Cases

1. **Connect Wallet**
   - Click "Connect Wallet"
   - Select "Freighter"
   - Approve connection in Freighter popup
   - Verify public key is displayed

2. **Persistent Connection**
   - Connect wallet
   - Refresh the page
   - Verify wallet remains connected

3. **Network Switching**
   - Connect wallet on Testnet
   - Switch to Mainnet
   - Verify Freighter prompts for network change
   - Confirm connection persists

4. **Disconnect**
   - Click on connected wallet address
   - Click "Disconnect"
   - Verify wallet is disconnected

5. **Error Handling**
   - Try connecting without Freighter installed
   - Try connecting with Freighter locked
   - Try switching networks with wrong network in Freighter
   - Verify error messages are user-friendly

## API Reference

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

### WalletType Enum

```typescript
enum WalletType {
  FREIGHTER = 'freighter',
  LOBSTR = 'lobstr',
  WALLET_CONNECT = 'walletconnect',
}
```

### NetworkType Enum

```typescript
enum NetworkType {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}
```

## Error Handling

The system provides user-friendly error messages for common scenarios:

- Freighter not installed
- Wallet locked
- Wrong network selected
- Connection timeout
- User rejection

All errors are caught and displayed in the UI with clear instructions.

## Future Enhancements

### LOBSTR Integration (Optional)

To add LOBSTR support:

1. Install LOBSTR SDK
2. Implement `connectLobstr()` in `lib/stellar/lobstr.ts`
3. Update `WalletContext` connect method
4. Enable LOBSTR button in `WalletButton`

### WalletConnect Integration (Optional)

To add WalletConnect support:

1. Install `@walletconnect/stellar`
2. Implement `connectWalletConnect()` in `lib/stellar/walletconnect.ts`
3. Update `WalletContext` connect method
4. Enable WalletConnect button in `WalletButton`

## Security Considerations

- Private keys never leave the wallet extension
- All transactions are signed within the wallet
- Network validation prevents wrong-network transactions
- Connection state is stored in localStorage (public keys only)
- No sensitive data is transmitted or stored

## Troubleshooting

### Wallet won't connect
- Ensure Freighter is installed and unlocked
- Check that you're on the correct network
- Clear browser cache and localStorage
- Try disconnecting and reconnecting

### Connection not persisting
- Check browser localStorage is enabled
- Verify no browser extensions are blocking storage
- Check console for errors

### Network mismatch errors
- Open Freighter settings
- Switch to the correct network (Testnet/Mainnet)
- Try connecting again

## Support

For issues or questions:
- Check Freighter documentation: https://docs.freighter.app/
- Review Stellar documentation: https://developers.stellar.org/
- Open an issue in the LumenTix repository
