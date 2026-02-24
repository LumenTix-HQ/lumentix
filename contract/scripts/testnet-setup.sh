#!/bin/bash

# Testnet setup script for Soroban contract testing
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Setting up testnet environment for contract testing...${NC}"

# Configuration
NETWORK="testnet"
CONTRACT_ADDRESS_FILE=".contract_address"
TEST_ACCOUNTS_FILE=".test_accounts"

# Check if Soroban CLI is installed
if ! command -v soroban &> /dev/null; then
    echo -e "${RED}❌ Soroban CLI is not installed.${NC}"
    echo "Please install it first: https://github.com/stellar/soroban-cli"
    exit 1
fi

# Function to fund account
fund_account() {
    local public_key=$1
    echo -e "${BLUE}💰 Funding account: $public_key${NC}"

    response=$(curl -s "https://friendbot.stellar.org?addr=$public_key")

    if echo "$response" | grep -q "hash"; then
        echo -e "${GREEN}✅ Account funded successfully!${NC}"
    else
        echo -e "${RED}❌ Failed to fund account!${NC}"
        echo "Response: $response"
        return 1
    fi
}

# Function to create test account
create_test_account() {
    local account_name=$1
    echo -e "${BLUE}🔐 Creating test account: $account_name${NC}"

    KEYPAIR_OUTPUT=$(soroban keys generate --network testnet)
    SECRET_KEY=$(echo "$KEYPAIR_OUTPUT" | grep "Secret:" | cut -d' ' -f2)
    PUBLIC_KEY=$(echo "$KEYPAIR_OUTPUT" | grep "Public:" | cut -d' ' -f2)

    fund_account "$PUBLIC_KEY"

    echo "$account_name:$PUBLIC_KEY:$SECRET_KEY" >> "$TEST_ACCOUNTS_FILE"

    echo -e "${GREEN}✅ Created $account_name:${NC}"
    echo -e "${YELLOW}   Public:  $PUBLIC_KEY${NC}"
    echo -e "${YELLOW}   Secret:  $SECRET_KEY${NC}"
}

# Check if contract is already deployed
if [ -f "$CONTRACT_ADDRESS_FILE" ]; then
    CONTRACT_ID=$(cat "$CONTRACT_ADDRESS_FILE")
    echo -e "${YELLOW}📄 Found existing contract: $CONTRACT_ID${NC}"

    read -p "Do you want to deploy a fresh contract? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}🔄 Using existing contract...${NC}"
    else
        echo -e "${BLUE}🗑️  Removing existing contract...${NC}"
        rm -f "$CONTRACT_ADDRESS_FILE"
    fi
fi

# Deploy contract if not exists
if [ ! -f "$CONTRACT_ADDRESS_FILE" ]; then
    echo -e "${BLUE}🚀 Deploying fresh contract...${NC}"

    # Build and optimize contract
    echo -e "${YELLOW}📦 Building contract...${NC}"
    cargo build --target wasm32-unknown-unknown --release
    soroban contract optimize "target/wasm32-unknown-unknown/release/lumentix_contract.wasm"

    # Create admin account
    echo -e "${YELLOW}👑 Creating admin account...${NC}"
    create_test_account "admin"

    # Get admin credentials
    ADMIN_SECRET=$(grep "admin:" "$TEST_ACCOUNTS_FILE" | cut -d':' -f3)
    ADMIN_PUBLIC=$(grep "admin:" "$TEST_ACCOUNTS_FILE" | cut -d':' -f2)

    # Deploy contract
    echo -e "${BLUE}📤 Deploying contract...${NC}"
    DEPLOY_OUTPUT=$(soroban contract deploy \
        --wasm "target/wasm32-unknown-unknown/release/lumentix_contract.optimized.wasm" \
        --source "$ADMIN_SECRET" \
        --network "$NETWORK")

    CONTRACT_ID=$(echo "$DEPLOY_OUTPUT" | grep "Contract ID:" | cut -d' ' -f3)

    if [ -z "$CONTRACT_ID" ]; then
        echo -e "${RED}❌ Contract deployment failed!${NC}"
        echo "$DEPLOY_OUTPUT"
        exit 1
    fi

    echo "$CONTRACT_ID" > "$CONTRACT_ADDRESS_FILE"
    echo -e "${GREEN}✅ Contract deployed: $CONTRACT_ID${NC}"

    # Initialize contract
    echo -e "${BLUE}🔧 Initializing contract...${NC}"
    soroban contract invoke \
        --id "$CONTRACT_ID" \
        --source "$ADMIN_SECRET" \
        --network "$NETWORK" \
        initialize \
        --admin "$ADMIN_PUBLIC"

    echo -e "${GREEN}✅ Contract initialized!${NC}"
fi

# Create test accounts
echo -e "${BLUE}👥 Creating test accounts...${NC}"
> "$TEST_ACCOUNTS_FILE"  # Clear file

# Admin account (already created above)
echo "admin:$ADMIN_PUBLIC:$ADMIN_SECRET" >> "$TEST_ACCOUNTS_FILE"

# Create additional test accounts
create_test_account "organizer1"
create_test_account "organizer2"
create_test_account "attendee1"
create_test_account "attendee2"
create_test_account "attendee3"

# Get final contract ID
CONTRACT_ID=$(cat "$CONTRACT_ADDRESS_FILE")

# Create environment file
ENV_FILE=".testnet.env"
cat > "$ENV_FILE" << EOF
# Testnet Environment Configuration
NETWORK=testnet
CONTRACT_ID=$CONTRACT_ID

# Admin Account
ADMIN_SECRET=$ADMIN_SECRET
ADMIN_PUBLIC=$ADMIN_PUBLIC

# Test Accounts
EOF

# Add test accounts to env file
while IFS=':' read -r name public secret; do
    if [ "$name" != "admin" ]; then
        echo "${name^^}_PUBLIC=$public" >> "$ENV_FILE"
        echo "${name^^}_SECRET=$secret" >> "$ENV_FILE"
    fi
done < "$TEST_ACCOUNTS_FILE"

echo -e "${GREEN}✅ Testnet setup complete!${NC}"

# Display summary
echo -e "${BLUE}📋 Setup Summary:${NC}"
echo -e "${YELLOW}   Network:     $NETWORK${NC}"
echo -e "${YELLOW}   Contract ID:  $CONTRACT_ID${NC}"
echo -e "${YELLOW}   Admin:        $ADMIN_PUBLIC${NC}"
echo -e "${YELLOW}   Test Accounts: $(grep -c ":" "$TEST_ACCOUNTS_FILE") created${NC}"

echo -e "${BLUE}📁 Files created:${NC}"
echo -e "${YELLOW}   $CONTRACT_ADDRESS_FILE - Contract ID${NC}"
echo -e "${YELLOW}   $TEST_ACCOUNTS_FILE - Test account credentials${NC}"
echo -e "${YELLOW}   $ENV_FILE - Environment variables${NC}"

echo -e "${BLUE}🔗 Useful links:${NC}"
echo -e "${YELLOW}   Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID${NC}"
echo -e "${YELLOW}   Friendbot: https://friendbot.stellar.org${NC}"

echo -e "${GREEN}🎉 Ready for testing!${NC}"
echo -e "${BLUE}💡 To use these variables, run:${NC}"
echo -e "${YELLOW}   source $ENV_FILE${NC}"

# Create test script
TEST_SCRIPT="test-contract.sh"
cat > "$TEST_SCRIPT" << 'EOF'
#!/bin/bash

# Load environment
source .testnet.env

echo "🧪 Testing Lumentix Contract..."
echo "Contract ID: $CONTRACT_ID"
echo "Admin: $ADMIN_PUBLIC"

# Test 1: Create an event
echo "📝 Creating test event..."
EVENT_ID=$(soroban contract invoke \
    --id $CONTRACT_ID \
    --source $ADMIN_SECRET \
    --network $NETWORK \
    create_event \
    --name "Test Event" \
    --description "A test event for contract validation" \
    --price 10000000 \
    --max_attendees 50 | grep -o '[0-9]*')

echo "✅ Created event with ID: $EVENT_ID"

# Test 2: Get events
echo "📋 Getting all events..."
soroban contract invoke \
    --id $CONTRACT_ID \
    --source $ADMIN_SECRET \
    --network $NETWORK \
    get_events

# Test 3: Get specific event
echo "🔍 Getting event $EVENT_ID..."
soroban contract invoke \
    --id $CONTRACT_ID \
    --source $ADMIN_SECRET \
    --network $NETWORK \
    get_event \
    --event_id $EVENT_ID

echo "🎉 Contract tests completed!"
EOF

chmod +x "$TEST_SCRIPT"
echo -e "${BLUE}📝 Created test script: $TEST_SCRIPT${NC}"
echo -e "${YELLOW}   Run it with: ./$TEST_SCRIPT${NC}"
