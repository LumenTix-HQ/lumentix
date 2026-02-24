# Soroban Development Environment Setup

This guide documents the steps taken to set up the development environment for Lumentix smart contracts.

## Prerequisites

- **Rust**: Ensure you have a modern Rust version installed.
- **WASM Target**: Added the WASM targets for contract compilation.
  ```bash
  rustup target add wasm32-unknown-unknown
  rustup target add wasm32v1-none
  ```

## Tools

### Stellar CLI
The official CLI for interacting with Stellar and Soroban.
- **Installation**:
  ```bash
  cargo install --locked stellar-cli --version 25.1.0
  ```
- **Verification**:
  ```bash
  stellar --version
  ```

## Workspace Structure

- `contract/`: Root directory for all smart contracts.
- `contract/Cargo.toml`: Workspace configuration.
- `contract/hello_world/`: Example contract for environment verification.

## Common Commands

### Build Contracts
Using standard Cargo:
```bash
cargo build --target wasm32-unknown-unknown --release
```
Or the recommended way using the Stellar CLI (uses `wasm32v1-none` for smaller binaries):
```bash
stellar contract build
```

### Run Tests
```bash
cargo test
```

### Deploy to Testnet
```bash
# For standard builds
stellar contract deploy --wasm target/wasm32-unknown-unknown/release/hello_world.wasm --source <identity> --network testnet

# For optimized builds (via stellar contract build)
stellar contract deploy --wasm target/wasm32v1-none/release/hello_world.wasm --source <identity> --network testnet
```
