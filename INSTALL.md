# Installation Instructions

## Prerequisites

1. **Node.js**: v18 or higher
2. **npm**: v9 or higher
3. **Freighter Wallet**: Browser extension

## Step 1: Install Freighter Wallet

### Chrome/Brave/Edge
1. Visit: https://chrome.google.com/webstore
2. Search for "Freighter"
3. Click "Add to Chrome/Brave/Edge"
4. Pin the extension to your toolbar

### Firefox
1. Visit: https://addons.mozilla.org/firefox
2. Search for "Freighter"
3. Click "Add to Firefox"
4. Pin the extension to your toolbar

### Setup Freighter
1. Click the Freighter icon
2. Choose "Create new account" or "Import account"
3. Follow the setup wizard
4. Save your recovery phrase securely

## Step 2: Install Project Dependencies

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Verify installation
npm list @stellar/freighter-api
```

Expected output:
```
@stellar/freighter-api@2.0.0
```

## Step 3: Configure Environment

Create `.env.local` file in the frontend directory:

```bash
# For Testnet (recommended for development)
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Or copy from example:
```bash
cp env.example .env.local
```

## Step 4: Fund Testnet Account (Optional)

If using testnet:

1. Open Freighter
2. Copy your public key (starts with G...)
3. Visit: https://laboratory.stellar.org/#account-creator
4. Paste your public key
5. Click "Get test network lumens"
6. Wait for confirmation

## Step 5: Run the Application

```bash
# Start development server
npm run dev
```

The app will be available at: http://localhost:3000

## Step 6: Test Wallet Connection

1. Navigate to: http://localhost:3000/wallet-demo
2. Click "Connect Wallet"
3. Select "Freighter"
4. Approve the connection in Freighter popup
5. Verify your public key is displayed

## Verification Checklist

- [ ] Freighter extension installed
- [ ] Freighter account created
- [ ] Dependencies installed (`npm install` successful)
- [ ] Environment file created (`.env.local`)
- [ ] Development server running (`npm run dev`)
- [ ] Demo page accessible (http://localhost:3000/wallet-demo)
- [ ] Wallet connection successful
- [ ] Connection persists after page refresh

## Troubleshooting

### "Cannot find module '@stellar/freighter-api'"

```bash
cd frontend
npm install @stellar/freighter-api
```

### "Freighter is not installed"

1. Install Freighter extension
2. Refresh the browser page
3. Try connecting again

### "Please unlock your Freighter wallet"

1. Click the Freighter extension icon
2. Enter your password
3. Try connecting again

### "Network mismatch"

1. Open Freighter settings
2. Switch to the correct network (Testnet/Mainnet)
3. Try connecting again

### Port 3000 already in use

```bash
# Use a different port
npm run dev -- -p 3001
```

### Dependencies not installing

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

## Next Steps

After successful installation:

1. ✅ Review the demo page
2. ✅ Test all wallet features
3. ✅ Read integration guide: `frontend/WALLET_INTEGRATION.md`
4. ✅ Integrate into your application
5. ✅ Run through testing checklist: `frontend/TESTING_CHECKLIST.md`

## Additional Resources

- **Quick Start**: `GET_STARTED.md`
- **Setup Guide**: `frontend/SETUP.md`
- **Integration Guide**: `frontend/WALLET_INTEGRATION.md`
- **Testing**: `frontend/TESTING_CHECKLIST.md`
- **Freighter Docs**: https://docs.freighter.app/
- **Stellar Docs**: https://developers.stellar.org/

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review `frontend/WALLET_INTEGRATION.md`
3. Check browser console for errors
4. Verify Freighter is unlocked and on correct network
5. Open an issue in the repository

## System Requirements

- **OS**: Windows, macOS, or Linux
- **Browser**: Chrome, Firefox, Brave, or Edge (latest version)
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **RAM**: 4GB minimum
- **Disk Space**: 500MB for dependencies

## Installation Complete!

You're ready to use the wallet integration. Start with the demo page at:
http://localhost:3000/wallet-demo

For integration into your app, see `GET_STARTED.md`.
