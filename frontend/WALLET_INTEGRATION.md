# Wallet Integration Guide

Lumentix connects to Stellar wallets (Freighter today, WalletConnect optional)
through React context. This is the single wallet document: it replaces the
former `README_WALLET.md` and `WALLET_QUICKSTART.md`.

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
- [Transaction signing](#transaction-signing)
- [Configuration](#configuration)
- [Security model](#security-model)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [API reference](#api-reference)
- [Adding a wallet](#adding-a-wallet)

## Overview

The wallet layer lives in `frontend/`:

```
frontend/
├── types/wallet.ts                 # TypeScript definitions
├── contexts/WalletContext.tsx      # Connection state (React context)
├── lib/stellar/
│   ├── wallet-utils.ts             # Storage and network helpers
│   ├── freighter.ts                # Freighter integration
│   └── transaction-helper.ts       # Transaction building/signing
├── hooks/useWalletConnection.ts    # Convenience hook
├── components/
│   ├── WalletButton.tsx            # Connect/disconnect UI
│   ├── NetworkSwitcher.tsx         # Testnet/Mainnet toggle
│   └── WalletInfo.tsx              # Wallet details
└── app/wallet-demo/                # Demo page
```

Implemented:

- Freighter connection and reconnect across reloads
- Network switching (testnet/mainnet) with mismatch warnings
- Transaction building, signing and submission
- Balance lookup and friendly error states
- TypeScript types for wallet, network and connection errors

Not implemented yet: LOBSTR, hardware wallets, multi-signature accounts and a
standalone balance widget.

## Prerequisites

- Node.js >= 20.19 (see the [README](./README.md))
- [Freighter](https://www.freighter.app/) installed and unlocked
- A Stellar account, funded from [Friendbot](https://friendbot.stellar.org)
  when using testnet

## Usage

`app/layout.tsx` already wraps the app in `WalletProvider`; no extra setup is
needed for pages. To consume the wallet:

```tsx
import { useWallet } from '@/contexts/WalletContext';

export default function MyComponent() {
  const { isConnected, publicKey, network, connect, disconnect } = useWallet();

  if (!isConnected) {
    return <button onClick={() => connect(WalletType.FREIGHTER)}>Connect wallet</button>;
  }

  return (
    <div>
      <p>Connected: {publicKey}</p>
      <p>Network: {network}</p>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
}
```

Pre-built components:

```tsx
import { WalletButton } from '@/components/WalletButton';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';

<header>
  <NetworkSwitcher />
  <WalletButton />
</header>
```

A demo is available at `/wallet-demo` while `npm run dev` is running.

## Transaction signing

Never ask for a secret key in a form. Build the transaction, then hand it to the
wallet for signing:

```tsx
import { TransactionHelper } from '@/lib/stellar/transaction-helper';
import { useWallet } from '@/contexts/WalletContext';

function PaymentButton() {
  const { publicKey, network } = useWallet();

  const sendPayment = async () => {
    const helper = new TransactionHelper(network);
    const tx = await helper.buildPaymentTransaction(publicKey!, 'GDESTINATION...', '10.00');
    const result = await helper.signAndSubmitWithFreighter(tx);
    console.log('Transaction hash:', result.hash);
  };

  return <button onClick={sendPayment}>Pay</button>;
}
```

Checkout uses the same pattern in `components/PaymentFlow.tsx`: the backend
returns an unsigned intent, the wallet signs it, and only the transaction hash
is sent back for confirmation.

## Configuration

Wallet behaviour is driven by the public environment variables in
`env.example`:

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=   # optional
```

For mainnet, set `NEXT_PUBLIC_STELLAR_NETWORK=mainnet` and
`NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org`. See
[`env.example`](./env.example) for the full list.

## Security model

- Private keys never leave the wallet extension; the app only sees public keys.
- All transactions are signed inside the wallet.
- The connected network is validated against `NEXT_PUBLIC_STELLAR_NETWORK`
  before signing.
- Only the public key and wallet type are persisted (localStorage).
- The app authenticates with HttpOnly cookies through `/api/proxy`. Wallet
  login/linking must not return raw JWTs to page JavaScript.
- Wallet linking belongs to `POST /wallet/challenge` + `POST /wallet/verify`
  (JWT-guarded), not the wallet-login endpoints.

## Testing

The manual checklist also lives in
[`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md). With Freighter installed:

1. Connect: click **Connect Wallet** → Freighter → approve. The public key is
   displayed.
2. Persistence: refresh; the wallet stays connected.
3. Network switch: switch testnet ↔ mainnet; Freighter prompts and the app
   warns on mainnet.
4. Disconnect: open the wallet menu → **Disconnect**; state clears.
5. Errors: connect with Freighter locked, with the wrong network, and with the
   extension missing; each shows a readable message.

## Troubleshooting

**Wallet won't connect** — make sure Freighter is installed and unlocked, the
selected network matches `NEXT_PUBLIC_STELLAR_NETWORK`, and no extension is
blocking storage. Clear the site's localStorage and retry.

**Connection does not persist** — localStorage may be disabled (private mode or
embedded iframe). Check the console for storage errors.

**Network mismatch** — open Freighter → Settings → Network and switch to the
network the app expects, then reconnect.

## API reference

```ts
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

enum WalletType {
  FREIGHTER = 'freighter',
  LOBSTR = 'lobstr',
  WALLET_CONNECT = 'walletconnect',
}

enum NetworkType {
  TESTNET = 'testnet',
  MAINNET = 'mainnet',
}
```

`useWalletConnection()` wraps the same state and adds `isConnecting`,
`connectionError` and `clearError`.

## Adding a wallet

1. Implement the connector in `lib/stellar/<wallet>.ts`.
2. Add the type to `WalletType` in `types/wallet.ts`.
3. Extend `WalletContext.connect()`.
4. Enable the option in `WalletButton`.
5. Add tests and update this document.

## Resources

- [Freighter documentation](https://docs.freighter.app/)
- [Stellar documentation](https://developers.stellar.org/)
- [Stellar SDK](https://stellar.github.io/js-stellar-sdk/)
- [Horizon API](https://developers.stellar.org/api/horizon)
