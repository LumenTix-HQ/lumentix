# Lumentix Smart Contract

A Soroban smart contract for decentralized event management on the Stellar network.

## Features

- **Event Management**: Create and manage events with pricing and capacity limits
- **Registration System**: Track attendee registrations with payment verification
- **Access Control**: Admin-only operations for event management
- **On-Chain Storage**: All event and registration data stored on blockchain

## Quick Start

### Prerequisites

- Rust 1.70+
- Soroban CLI

### Installation

```bash
# Install dependencies
make setup

# Build contract
make build

# Run tests
make test

# Deploy to testnet
make deploy
```

## Contract Functions

### Admin Functions

- `initialize(admin)` - Initialize contract with admin address
- `create_event(name, description, price, max_attendees)` - Create new event
- `update_event_status(event_id, is_active)` - Update event status

### Public Functions

- `get_events()` - Get all events
- `get_event(event_id)` - Get specific event details
- `register_for_event(event_id, payment_tx_hash)` - Register for event
- `get_event_registrations(event_id)` - Get event registrations
- `get_user_registrations(user)` - Get user's registrations

## Data Structures

### Event

```rust
pub struct Event {
    pub id: u64,
    pub name: String,
    pub description: String,
    pub price: i128,
    pub max_attendees: u32,
    pub current_attendees: u32,
    pub organizer: Address,
    pub is_active: bool,
    pub created_at: u64,
}
```

### Registration

```rust
pub struct Registration {
    pub event_id: u64,
    pub attendee: Address,
    pub payment_tx_hash: String,
    pub registered_at: u64,
}
```

## Development

### Build

```bash
cargo build --target wasm32-unknown-unknown --release
```

### Test

```bash
cargo test
```

### Optimize

```bash
soroban contract optimize target/wasm32-unknown-unknown/release/lumentix_contract.wasm
```

## Deployment

### Testnet

```bash
# Quick setup with test accounts
./scripts/testnet-setup.sh

# Or manual deployment
./scripts/deploy.sh
```

### Manual Deployment

```bash
# Deploy
soroban contract deploy \
    --wasm target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm \
    --source $ADMIN_SECRET \
    --network testnet

# Initialize
soroban contract invoke \
    --id $CONTRACT_ID \
    --source $ADMIN_SECRET \
    --network testnet \
    initialize \
    --admin $ADMIN_PUBLIC
```

## Testing

### Unit Tests

```bash
cargo test
```

### Integration Tests

```bash
./scripts/testnet-setup.sh
./test-contract.sh
```

## Scripts

- `scripts/build.sh` - Build contract
- `scripts/test.sh` - Run tests
- `scripts/optimize.sh` - Optimize WASM
- `scripts/deploy.sh` - Deploy to testnet
- `scripts/testnet-setup.sh` - Complete testnet setup

## Makefile Targets

- `make setup` - Install dependencies
- `make build` - Build contract
- `make test` - Run tests
- `make optimize` - Optimize WASM
- `make deploy` - Deploy to testnet
- `make clean` - Clean artifacts
