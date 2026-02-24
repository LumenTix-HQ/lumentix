# 🚀 Get Started with Wallet Integration

## Quick Setup (3 minutes)

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Install Freighter Wallet
Visit: https://www.freighter.app/
- Chrome/Brave: Install from Chrome Web Store
- Firefox: Install from Firefox Add-ons

### 3. Setup Freighter
- Create new account or import existing
- Switch to Testnet in Freighter settings
- Get free testnet XLM: https://laboratory.stellar.org/#account-creator

### 4. Run Demo
```bash
npm run dev
```
Visit: http://localhost:3000/wallet-demo

### 5. Test Connection
1. Click "Connect Wallet"
2. Select "Freighter"
3. Approve connection in popup
4. See your wallet connected!

## ✅ What You Get

- **Freighter Integration**: Full wallet connection support
- **Persistent Sessions**: Connection survives page reloads
- **Network Switching**: Toggle between Testnet and Mainnet
- **Error Handling**: User-friendly error messages
- **TypeScript**: Full type safety
- **Transaction Support**: Sign and submit transactions
- **Demo Page**: Working examples

## 📁 Key Files

```
frontend/
├── contexts/WalletContext.tsx      ← Main wallet state
├── components/
│   ├── WalletButton.tsx           ← Connect button
│   ├── NetworkSwitcher.tsx        ← Network toggle
│   └── WalletInfo.tsx             ← Wallet details
├── hooks/useWalletConnection.ts   ← Easy-to-use hook
└── app/wallet-demo/               ← Demo & examples
```

## 💻 Basic Usage

### Add to Your App (3 steps)

**Step 1**: Wrap with provider
```tsx
import { WalletProvider } from '@/contexts/WalletContext';

<WalletProvider>
  <YourApp />
</WalletProvider>
```

**Step 2**: Add UI components
```tsx
import { WalletButton, NetworkSwitcher } from '@/components';

<header>
  <NetworkSwitcher />
  <WalletButton />
</header>
```

**Step 3**: Use in components
```tsx
import { useWallet } from '@/contexts/WalletContext';

function MyComponent() {
  const { isConnected, publicKey } = useWallet();
  
  return isConnected ? (
    <p>Connected: {publicKey}</p>
  ) : (
    <p>Connect your wallet</p>
  );
}
```

## 🎯 Test Checklist

- [ ] Connect wallet successfully
- [ ] Refresh page - wallet stays connected
- [ ] Switch between Testnet and Mainnet
- [ ] Disconnect wallet
- [ ] Try connecting without Freighter (see error)
- [ ] Try with locked wallet (see error)

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `frontend/SETUP.md` | Detailed setup instructions |
| `frontend/WALLET_QUICKSTART.md` | Quick start guide |
| `frontend/WALLET_INTEGRATION.md` | Complete integration guide |
| `frontend/TESTING_CHECKLIST.md` | Testing procedures |
| `frontend/README_WALLET.md` | Main README |

## 🔧 Configuration

Create `.env.local`:
```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

## 🐛 Common Issues

**"Freighter not installed"**
→ Install Freighter extension and refresh page

**"Please unlock your wallet"**
→ Open Freighter and enter password

**"Network mismatch"**
→ Switch network in Freighter settings

**Connection not persisting**
→ Check localStorage is enabled in browser

## 🎓 Examples

### Check if Connected
```tsx
const { isConnected } = useWallet();
if (!isConnected) {
  return <p>Please connect wallet</p>;
}
```

### Get Public Key
```tsx
const { publicKey } = useWallet();
console.log('User wallet:', publicKey);
```

### Connect Programmatically
```tsx
import { useWalletConnection } from '@/hooks/useWalletConnection';
import { WalletType } from '@/types/wallet';

const { connectWallet } = useWalletConnection();
await connectWallet(WalletType.FREIGHTER);
```

### Send Transaction
```tsx
import { TransactionHelper } from '@/lib/stellar/transaction-helper';

const { publicKey, network } = useWallet();
const helper = new TransactionHelper(network);

const tx = await helper.buildPaymentTransaction(
  publicKey!,
  'GDESTINATION...',
  '10.00'
);

const result = await helper.signAndSubmitWithFreighter(tx);
console.log('Success:', result.hash);
```

## 🎉 Next Steps

1. ✅ Complete setup above
2. ✅ Test the demo page
3. ✅ Integrate into your app
4. ✅ Connect to payment flow
5. ✅ Deploy to production

## 📞 Need Help?

- Check `frontend/WALLET_INTEGRATION.md` for detailed docs
- Review `frontend/TESTING_CHECKLIST.md` for testing
- See `frontend/ARCHITECTURE.md` for system design
- Check Freighter docs: https://docs.freighter.app/

## ✨ Features

- ✅ Freighter wallet
- ✅ Persistent connection
- ✅ Network switching
- ✅ Error handling
- ✅ Loading states
- ✅ TypeScript
- ⏳ LOBSTR (coming soon)
- ⏳ WalletConnect (coming soon)

---

**Ready to go!** Start with the demo page and integrate into your app.

**Issue**: #33 - Implement Wallet Connection  
**Status**: ✅ Complete
