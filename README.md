# Lumentix – Stellar Event Platform

A decentralized event management platform built on the **Stellar blockchain** that makes event ticketing, payments, and sponsorships as smooth as a Stellar transaction (which is pretty smooth, by the way).

---

## What is Lumentix?

Lumentix is your go-to platform for managing events on the blockchain. Whether you're organizing a conference, concert, or community meetup, Lumentix handles everything from ticket sales to sponsor payments—all powered by Stellar's lightning-fast, low-cost network.

## Features

### For Event Goers

- **Browse Events**: Discover upcoming events with search and filters
- **Register**: Sign up for free or paid events in seconds
- **Pay with Crypto**: Use XLM, USDC, or other Stellar assets
- **Digital Tickets**: Blockchain-verified tickets you can transfer or resell
- **Mobile-Friendly**: Works beautifully on any device

### For Organizers

- **Create Events**: List your event with all the details
- **Accept Payments**: Get paid instantly with minimal fees
- **Call for Sponsors**: Set up sponsor tiers and funding goals
- **Track Registrations**: See who's coming to your event
- **Secure Escrow**: Funds held safely until event completion

### For Sponsors

- **Find Events**: Browse events seeking sponsorship
- **Choose Tiers**: Bronze, Silver, Gold—pick your level
- **Transparent Payments**: All transactions visible on-chain
- **Get Recognition**: Automatic badges and benefits

## Architecture

### Frontend (Next.js)

- **Location**: `/frontend/`
- **Tech Stack**: Next.js 14, React 18, TypeScript, Tailwind CSS
- **Features**: Event browsing, registration, Stellar payments, real-time status

### Smart Contract (Soroban)

- **Location**: `/contract/`
- **Tech Stack**: Rust, Soroban SDK
- **Features**: Event management, registration tracking, payment verification

## Quick Start

### Prerequisites

- Node.js 18+
- Rust 1.70+
- Soroban CLI

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Contract Setup

```bash
cd contract
make setup    # Install dependencies
make build    # Build contract
make test     # Run tests
make deploy   # Deploy to testnet
```

## Smart Contract Development

### Contract Structure

```
contract/
├── src/
│   └── lib.rs              # Main contract implementation
├── scripts/
│   ├── build.sh            # Build script
│   ├── test.sh             # Test script
│   ├── optimize.sh         # Optimization script
│   ├── deploy.sh          # Deployment script
│   └── testnet-setup.sh   # Complete testnet setup
├── Cargo.toml             # Rust dependencies
└── Makefile              # Build automation
```

### Contract Features

- **Event Management**: Create, update, and list events
- **Registration System**: Track attendee registrations
- **Payment Integration**: Verify Stellar payments
- **Access Control**: Admin-only operations
- **Data Storage**: On-chain event and registration data

### Contract Functions

#### Admin Functions

- `initialize(admin)` - Initialize contract with admin
- `create_event(name, description, price, max_attendees)` - Create new event
- `update_event_status(event_id, is_active)` - Update event status

#### Public Functions

- `get_events()` - Get all events
- `get_event(event_id)` - Get specific event
- `register_for_event(event_id, payment_tx_hash)` - Register for event
- `get_event_registrations(event_id)` - Get event registrations
- `get_user_registrations(user)` - Get user's registrations

## Deployment Guide

### 1. Local Development

```bash
cd contract

# Install dependencies
make setup

# Build contract
make build

# Run tests
make test

# Optimize for deployment
make optimize
```

### 2. Testnet Deployment

```bash
# Quick deployment (auto-generates admin account)
./scripts/deploy.sh

# Or with existing credentials
export ADMIN_SECRET="your_secret_key"
export ADMIN_PUBLIC="your_public_key"
./scripts/deploy.sh
```

### 3. Complete Testnet Setup

```bash
# Sets up fresh contract + test accounts
./scripts/testnet-setup.sh

# Load environment variables
source .testnet.env

# Test the contract
./test-contract.sh
```

### 4. Manual Deployment Steps

```bash
# 1. Build and optimize
make build
make optimize

# 2. Deploy contract
soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm \
    --source $ADMIN_SECRET \
    --network testnet

# 3. Initialize contract
soroban contract invoke \
    --id $CONTRACT_ID \
    --source $ADMIN_SECRET \
    --network testnet \
    initialize \
    --admin $ADMIN_PUBLIC
```

## Testing

### Contract Tests

```bash
cd contract

# Run unit tests
make test
# or
cargo test

# Run integration tests
./scripts/testnet-setup.sh
./test-contract.sh
```

### Frontend Tests

```bash
cd frontend
npm test
```

## CI/CD

### GitHub Actions

The project includes automated CI/CD for contract development:

- **Triggers**: Push/PR to main/develop branches with contract changes
- **Jobs**:
  - Run `cargo test`
  - Build contract with `cargo build`
  - Optimize WASM with `soroban contract optimize`
  - Upload artifacts

### Workflow File

`.github/workflows/contract.yml` - Automated testing and building

## Environment Variables

### Contract Development

```bash
# Testnet
NETWORK=testnet
CONTRACT_ID=your_contract_id
ADMIN_SECRET=your_admin_secret
ADMIN_PUBLIC=your_admin_public
```

### Frontend Development

```bash
# Copy from contract/.testnet.env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_CONTRACT_ID=your_contract_id
```

## Contributing

This project is designed for distributed development, with clear, actionable issues for developers of all skill levels.

> **See [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md) for detailed contribution guidelines.**

---

## Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Horizon API](https://developers.stellar.org/api)
- [Soroban Smart Contracts](https://soroban.stellar.org/)
- [Next.js Documentation](https://nextjs.org/docs)

---

## License

MIT License - feel free to use this project however you'd like!

---

**Built with love on the Stellar network**
