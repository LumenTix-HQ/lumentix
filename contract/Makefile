.PHONY: build test clean install deploy-testnet optimize

# Build the contract
build:
	cargo build --target wasm32-unknown-unknown --release

# Run tests
test:
	cargo test

# Run tests with output
test-verbose:
	cargo test -- --nocapture

# Clean build artifacts
clean:
	cargo clean

# Install required tools
install:
	rustup target add wasm32-unknown-unknown
	cargo install soroban-cli

# Optimize the WASM binary
optimize: build
	soroban contract optimize \
		--wasm target/wasm32-unknown-unknown/release/lumentix_contract.wasm

# Build and run tests
all: build test

# Check code without building
check:
	cargo check

# Format code
fmt:
	cargo fmt

# Run clippy linter
lint:
	cargo clippy -- -D warnings

# Generate documentation
docs:
	cargo doc --no-deps --open

# Deploy to testnet (requires SOROBAN_SECRET_KEY environment variable)
deploy-testnet: optimize
	@if [ -z "$(SOROBAN_SECRET_KEY)" ]; then \
		echo "Error: SOROBAN_SECRET_KEY environment variable not set"; \
		exit 1; \
	fi
	soroban contract deploy \
		--wasm target/wasm32-unknown-unknown/release/lumentix_contract.wasm \
		--source $(SOROBAN_SECRET_KEY) \
		--rpc-url https://soroban-testnet.stellar.org \
		--network-passphrase "Test SDF Network ; September 2015"

# Initialize contract (requires CONTRACT_ID and ADMIN_ADDRESS)
initialize:
	@if [ -z "$(CONTRACT_ID)" ] || [ -z "$(ADMIN_ADDRESS)" ]; then \
		echo "Error: CONTRACT_ID and ADMIN_ADDRESS must be set"; \
		exit 1; \
	fi
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--source $(SOROBAN_SECRET_KEY) \
		--rpc-url https://soroban-testnet.stellar.org \
		--network-passphrase "Test SDF Network ; September 2015" \
		-- initialize \
		--admin $(ADMIN_ADDRESS)

# Full deployment workflow
deploy-full: optimize deploy-testnet
	@echo "Contract deployed! Save the contract ID and run:"
	@echo "make initialize CONTRACT_ID=<id> ADMIN_ADDRESS=<address>"
