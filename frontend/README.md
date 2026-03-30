# Lumentix - Stellar Event Platform

A decentralized event management platform with blockchain payments built on Next.js and Stellar.

## Features

- 🌟 Event registration with Stellar blockchain payments
- 💳 Secure transaction signing and submission
- 📊 Real-time transaction status tracking
- 🧪 Testnet integration for safe testing
- 🎨 Modern UI with Tailwind CSS
- 🔐 Client-side key management (no server exposure)

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Blockchain**: Stellar SDK (@stellar/stellar-sdk)
- **Styling**: Tailwind CSS
- **Network**: Stellar Testnet

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### 1. Browse Events

- Navigate to `/events` to see available events
- Click "Register Now" on any event to start the payment process

### 2. Test Payment Flow

- Navigate to `/test-payment` for a guided testing experience
- Generate a test account and fund it with testnet XLM
- Test the complete payment flow

### 3. Making Payments

1. Enter your Stellar secret key (testnet)
2. Review the event details and payment amount
3. Click "Pay with Stellar" to initiate the transaction
4. The transaction will be built, signed, and submitted automatically
5. View the transaction status and confirmation

## Architecture

### Components

- **StellarPayment**: Main payment component handling the complete flow
- **TransactionStatus**: Displays transaction status with visual indicators
- **StellarService**: Utility class for Stellar operations

### Key Features

#### Transaction Building

- Creates Stellar transactions with proper fee and network settings
- Includes event metadata in transaction memos
- Supports native XLM payments

#### Security

- All signing happens client-side
- Secret keys never leave the browser
- Uses Stellar Testnet for safe testing

#### Error Handling

- Comprehensive error catching and user feedback
- Transaction status tracking
- Retry functionality for failed transactions

#### User Experience

- Real-time status updates
- Transaction confirmation with explorer links
- Copy transaction IDs for reference

## Stellar Integration

### Network Configuration

- **Testnet**: https://horizon-testnet.stellar.org
- **Public**: https://horizon.stellar.org (for production)

### Transaction Flow

1. Load source account from Stellar
2. Build payment transaction with event details
3. Sign transaction with user's secret key
4. Submit to Stellar network
5. Track transaction status

### Account Management

- Generate new test accounts
- Fund accounts using Stellar Friendbot
- Check account balances
- Validate addresses and keys

## Testing

The platform includes comprehensive testing capabilities:

### Test Payment Page

- Generate test accounts automatically
- Fund accounts with testnet XLM
- Test complete payment flow
- View transaction details

### Manual Testing

1. Create a Stellar testnet account
2. Fund it using [Stellar Friendbot](https://friendbot.stellar.org)
3. Use the secret key to make test payments
4. Verify transactions on [Stellar Explorer](https://stellar.expert)

## Security Considerations

- ✅ Secret keys never transmitted to servers
- ✅ All cryptographic operations client-side
- ✅ Testnet isolation for safe testing
- ✅ Input validation for addresses and amounts
- ⚠️ Production use requires additional security measures

## Future Enhancements

- [ ] Multi-asset support (custom tokens)
- [ ] Wallet integration (Ledger, Freighter, etc.)
- [ ] Advanced error recovery
- [ ] Transaction history
- [ ] Event management dashboard
- [ ] Multi-signature support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Next.js Documentation](https://nextjs.org/docs)
- [Stellar Testnet Faucet](https://friendbot.stellar.org)
- [Stellar Explorer](https://stellar.expert)
