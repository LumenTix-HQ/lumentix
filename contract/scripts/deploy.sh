#!/bin/bash

# Deploy script for Soroban contract to testnet
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying Soroban contract to testnet...${NC}"

# Configuration
NETWORK="testnet"
WASM_FILE="target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm"
CONTRACT_ADDRESS_FILE=".contract_address"

# Check if Soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo -e "${RED}❌ Soroban CLI is not installed. Please install it first.${NC}"
    echo "Visit: https://github.com/stellar/soroban-cli"
    exit 1
fi

# Check if WASM file exists
if [ ! -f "$WASM_FILE" ]; then
    echo -e "${RED}❌ Optimized WASM file not found.${NC}"
    echo -e "${YELLOW}📦 Building and optimizing contract...${NC}"

    # Build and optimize
    cargo build --target wasm32-unknown-unknown --release
    soroban contract optimize "target/wasm32-unknown-unknown/release/lumentix_contract.wasm"

    if [ ! -f "$WASM_FILE" ]; then
        echo -e "${RED}❌ Build failed. Please check the errors above.${NC}"
        exit 1
    fi
fi

# Get admin credentials
if [ -z "$ADMIN_SECRET" ]; then
    echo -e "${YELLOW}🔑 ADMIN_SECRET environment variable not set.${NC}"
    echo -e "${YELLOW}💡 You can set it with: export ADMIN_SECRET=\"your_secret_key\"${NC}"
    echo -e "${YELLOW}🔍 Or the script will generate a new keypair.${NC}"

    # Generate new keypair
    echo -e "${BLUE}🔐 Generating new keypair...${NC}"
    KEYPAIR_OUTPUT=$(soroban keys generate --network testnet)
    ADMIN_SECRET=$(echo "$KEYPAIR_OUTPUT" | grep "Secret:" | cut -d' ' -f2)
    ADMIN_PUBLIC=$(echo "$KEYPAIR_OUTPUT" | grep "Public:" | cut -d' ' -f2)

    echo -e "${GREEN}✅ Generated new keypair:${NC}"
    echo -e "${YELLOW}   Public:  $ADMIN_PUBLIC${NC}"
    echo -e "${YELLOW}   Secret:  $ADMIN_SECRET${NC}"
    echo -e "${RED}⚠️  Save the secret key securely!${NC}"

    # Fund the account on testnet
    echo -e "${BLUE}💰 Funding account with testnet XLM...${NC}"
    curl -s "https://friendbot.stellar.org?addr=$ADMIN_PUBLIC" > /dev/null
    echo -e "${GREEN}✅ Account funded!${NC}"
fi

# Get public key from secret if not already set
if [ -z "$ADMIN_PUBLIC" ]; then
    ADMIN_PUBLIC=$(soroban keys address --secret "$ADMIN_SECRET" --network testnet)
fi

echo -e "${BLUE}📤 Deploying contract...${NC}"
echo -e "${YELLOW}   Network: $NETWORK${NC}"
echo -e "${YELLOW}   Admin:    $ADMIN_PUBLIC${NC}"

# Deploy contract
DEPLOY_OUTPUT=$(soroban contract deploy \
    --wasm "$WASM_FILE" \
    --source "$ADMIN_SECRET" \
    --network "$NETWORK")

CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep "Contract ID:" | cut -d' ' -f3)

if [ -z "$CONTRACT_ID" ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

echo -e "${GREEN}✅ Contract deployed successfully!${NC}"
echo -e "${GREEN}📄 Contract ID: $CONTRACT_ID${NC}"

# Save contract address
echo "$CONTRACT_ID" > "$CONTRACT_ADDRESS_FILE"
echo -e "${BLUE}💾 Contract ID saved to: $CONTRACT_ADDRESS_FILE${NC}"

# Initialize contract
echo -e "${BLUE}🔧 Initializing contract...${NC}"
INIT_OUTPUT=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source "$ADMIN_SECRET" \
    --network "$NETWORK" \
    initialize \
    --admin "$ADMIN_PUBLIC")

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Contract initialized successfully!${NC}"
else
    echo -e "${RED}❌ Contract initialization failed!${NC}"
    echo "$INIT_OUTPUT"
    exit 1
fi

# Get contract info
echo -e "${BLUE}📋 Getting contract information...${NC}"
soroban contract info --id "$CONTRACT_ID" --network "$NETWORK"

echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo -e "${YELLOW}📝 Contract Details:${NC}"
echo -e "${YELLOW}   Network:     $NETWORK${NC}"
echo -e "${YELLOW}   Contract ID:  $CONTRACT_ID${NC}"
echo -e "${YELLOW}   Admin:        $ADMIN_PUBLIC${NC}"
echo -e "${YELLOW}   WASM File:    $WASM_FILE${NC}"

echo -e "${BLUE}🔗 Explorer URL: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID${NC}"

# Export environment variables for easy use
echo -e "${BLUE}📤 Export these variables for future use:${NC}"
echo -e "${YELLOW}export CONTRACT_ID=\"$CONTRACT_ID\"${NC}"
echo -e "${YELLOW}export ADMIN_SECRET=\"$ADMIN_SECRET\"${NC}"
echo -e "${YELLOW}export ADMIN_PUBLIC=\"$ADMIN_PUBLIC\"${NC}"
