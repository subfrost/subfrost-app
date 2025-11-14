#!/usr/bin/env node

/**
 * Test script for the mint API endpoint
 * This will help debug any issues with minting tokens
 */

const TEST_ADDRESS = 'bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'; // Standard regtest address

async function testMintAPI() {
  console.log('🧪 Testing Mint API Endpoint\n');
  console.log('='.repeat(60));
  
  // Step 1: Check environment
  console.log('\n📋 Step 1: Checking Environment');
  console.log('-'.repeat(60));
  console.log('NEXT_PUBLIC_NETWORK:', process.env.NEXT_PUBLIC_NETWORK);
  console.log('BITCOIN_RPC_URL:', process.env.BITCOIN_RPC_URL || 'http://127.0.0.1:18443 (default)');
  console.log('BITCOIN_RPC_USER:', process.env.BITCOIN_RPC_USER || 'bitcoinrpc (default)');
  console.log('BITCOIN_RPC_PASSWORD:', process.env.BITCOIN_RPC_PASSWORD ? '***' : 'bitcoinrpc (default)');
  
  // Step 2: Test Bitcoin RPC connection
  console.log('\n🔌 Step 2: Testing Bitcoin RPC Connection');
  console.log('-'.repeat(60));
  
  const rpcUrl = process.env.BITCOIN_RPC_URL || 'http://127.0.0.1:18443';
  const rpcUser = process.env.BITCOIN_RPC_USER || 'bitcoinrpc';
  const rpcPassword = process.env.BITCOIN_RPC_PASSWORD || 'bitcoinrpc';
  
  try {
    const auth = Buffer.from(`${rpcUser}:${rpcPassword}`).toString('base64');
    
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 'test',
        method: 'getblockchaininfo',
        params: [],
      }),
    });
    
    if (!response.ok) {
      console.error(`❌ Bitcoin RPC connection failed: ${response.status} ${response.statusText}`);
      console.error('Response:', await response.text());
      return false;
    }
    
    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Bitcoin RPC error:', data.error);
      return false;
    }
    
    console.log('✅ Bitcoin RPC connected successfully!');
    console.log('Chain:', data.result.chain);
    console.log('Blocks:', data.result.blocks);
    console.log('Headers:', data.result.headers);
    
  } catch (error: any) {
    console.error('❌ Failed to connect to Bitcoin RPC:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Make sure docker-compose is running: cd reference/alkanes && docker-compose ps');
    console.error('2. Check if port 18443 is accessible: lsof -i :18443');
    console.error('3. View bitcoind logs: cd reference/alkanes && docker-compose logs bitcoind');
    return false;
  }
  
  // Step 3: Test minting endpoint
  console.log('\n💰 Step 3: Testing Mint API Endpoint');
  console.log('-'.repeat(60));
  console.log('Test address:', TEST_ADDRESS);
  
  try {
    const mintResponse = await fetch('http://localhost:3000/api/regtest/mint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: TEST_ADDRESS,
        tokens: {
          btc: 0.1, // Small amount for testing
        },
      }),
    });
    
    console.log('Response status:', mintResponse.status);
    
    const mintData = await mintResponse.json();
    console.log('\nResponse body:');
    console.log(JSON.stringify(mintData, null, 2));
    
    if (mintResponse.ok) {
      console.log('\n✅ Mint API test PASSED!');
      console.log('Transaction ID:', mintData.txid);
      console.log('Blocks generated:', mintData.blocksGenerated);
      return true;
    } else {
      console.log('\n❌ Mint API test FAILED');
      console.error('Error:', mintData.error);
      if (mintData.details) console.error('Details:', mintData.details);
      if (mintData.setup) {
        console.error('\nSetup instructions:');
        mintData.setup.forEach((step: string) => console.error('  ' + step));
      }
      return false;
    }
    
  } catch (error: any) {
    console.error('❌ Failed to call mint API:', error.message);
    
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      console.error('\n⚠️  Next.js dev server is not running!');
      console.error('\nStart the dev server in another terminal:');
      console.error('  cd /home/ghostinthegrey/subfrost-app');
      console.error('  npm run dev:regtest');
      console.error('\nThen run this test again.');
    }
    return false;
  }
}

// Run the test
console.log('🚀 Mint API Test Suite');
console.log('='.repeat(60));

testMintAPI()
  .then((success) => {
    console.log('\n' + '='.repeat(60));
    if (success) {
      console.log('✅ All tests passed!');
      process.exit(0);
    } else {
      console.log('❌ Tests failed');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });
