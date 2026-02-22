.PHONY: help build test optimize clean deploy setup

# Default target
help:
	@echo "Available targets:"
	@echo "  setup     - Install Rust and Soroban CLI"
	@echo "  build     - Build the Soroban contract"
	@echo "  test      - Run contract tests"
	@echo "  optimize  - Optimize the contract WASM"
	@echo "  clean     - Clean build artifacts"
	@echo "  deploy    - Deploy contract to testnet"
	@echo "  help      - Show this help message"

# Install dependencies
setup:
	@echo "Setting up development environment..."
	@curl --location --proto '=https' --tlsv1.2 --silent --show-error https://github.com/soroban-example/soroban-cli/releases/latest/download/soroban-cli-install.sh | sh
	@rustup target add wasm32-unknown-unknown
	@cargo install cargo-dylint dylint-link
	@echo "Setup complete! Please restart your terminal or run: source ~/.bashrc"

# Build the contract
build:
	@echo "Building contract..."
	cargo build --target wasm32-unknown-unknown --release
	@echo "Build complete. WASM file: target/wasm32-unknown-unknown/release/lumentix_contract.wasm"

# Run tests
test:
	@echo "Running contract tests..."
	cargo test

# Optimize the contract WASM
optimize:
	@echo "Optimizing contract..."
	cargo run --bin optimize -- target/wasm32-unknown-unknown/release/lumentix_contract.wasm
	@echo "Optimization complete. Optimized WASM file: target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	cargo clean
	rm -f *.wasm *.wasm.gz

# Deploy to testnet (requires environment variables)
deploy: optimize
	@echo "Deploying to testnet..."
	@if [ -z "$(CONTRACT_ID)" ]; then \
		echo "Error: CONTRACT_ID environment variable not set"; \
		echo "Usage: CONTRACT_ID=your_contract_id make deploy"; \
		exit 1; \
	fi
	soroban contract deploy \
		--wasm target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm \
		--source $(ADMIN_SECRET) \
		--network testnet
	@echo "Deployment complete!"

# Initialize contract
init:
	@echo "Initializing contract..."
	@if [ -z "$(CONTRACT_ID)" ]; then \
		echo "Error: CONTRACT_ID environment variable not set"; \
		echo "Usage: CONTRACT_ID=your_contract_id ADMIN_SECRET=your_secret make init"; \
		exit 1; \
	fi
	soroban contract invoke \
		--id $(CONTRACT_ID) \
		--source $(ADMIN_SECRET) \
		--network testnet \
		initialize \
		--admin $(ADMIN_PUBLIC)
	@echo "Contract initialized with admin: $(ADMIN_PUBLIC)"

# Get contract info
info:
	@echo "Getting contract information..."
	@if [ -z "$(CONTRACT_ID)" ]; then \
		echo "Error: CONTRACT_ID environment variable not set"; \
		echo "Usage: CONTRACT_ID=your_contract_id make info"; \
		exit 1; \
	fi
	soroban contract info --id $(CONTRACT_ID) --network testnet

# List all targets
list:
	@$(MAKE) -pRrq -f $(firstword $(MAKEFILE_LIST)) : 2>/dev/null | awk -v RS= -F: '/^# File/,/^# Finished Make data base/ {if ($$1 !~ "^[#.]") {print $$1}}' | sort | egrep -v -e '^[^[:alnum:]]' -e '^$@$$'
