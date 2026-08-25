// Test script to verify Stellar SDK integration
// Run with: node test-stellar-integration.js

const { Server } = require('@stellar/stellar-sdk');

async function testStellarConnection() {
  try {
    console.log('🚀 Testing Stellar SDK Integration...');
    
    // Test connection to Stellar testnet
    const server = new Server('https://horizon-testnet.stellar.org');
    console.log('✅ Stellar SDK initialized');
    
    // Test basic API call - get latest ledger
    const ledger = await server.ledgers().limit(1).call();
    console.log('✅ Connected to Stellar testnet');
    console.log(`📊 Latest ledger: ${ledger.records[0].sequence}`);
    
    // Test network configuration
    const network = await server.root();
    console.log(`🌐 Network passphrase: ${network.network_passphrase}`);
    
    console.log('🎉 All Stellar SDK tests passed!');
    console.log('\n📝 Next steps:');
    console.log('1. Free up disk space on your system');
    console.log('2. Run npm install to install dependencies');
    console.log('3. Run npm run dev to start the development server');
    console.log('4. Install Freighter wallet browser extension');
    console.log('5. Connect your wallet to test the integration');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testStellarConnection();
