#!/usr/bin/env node
/**
 * Deploy ERC20 peg alkane to REMOTE subfrost regtest
 * This environment has lua_evalscript which properly filters coinbase UTXOs
 */

import fs from 'fs';

// Suppress WASM debug logging
process.env.RUST_LOG = 'error';

console.log('=== ERC20 PEG ALKANE DEPLOYMENT (REMOTE REGTEST) ===\n');

// Load the WASM SDK
console.log('Loading WASM SDK...');
const wasm = await import('@alkanes/ts-sdk/wasm');

// Create provider for REMOTE subfrost regtest
// Use "subfrost-regtest" which points to the remote subfrost regtest server
const provider = new wasm.WebProvider('subfrost-regtest');

// Standard test mnemonic
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
provider.walletLoadMnemonic(mnemonic, null);

console.log('Provider initialized for REMOTE subfrost regtest');
console.log('RPC URL:', provider.sandshrew_rpc_url());

// Get addresses
const p2wpkhAddress = await provider.walletGetAddress('p2wpkh', 0);
const p2trAddress = await provider.walletGetAddress('p2tr', 0);
console.log('P2WPKH Address:', p2wpkhAddress);
console.log('P2TR Address:', p2trAddress);

// Check balance first
console.log('\nChecking wallet balance...');
try {
  const balance = await provider.walletGetBalance();
  console.log('Balance:', balance);
} catch (e) {
  console.log('Balance check failed:', e.message);
}

// Read WASM hex
const wasmPath = '/home/ghostinthegrey/subfrost-erc20/target/wasm32-unknown-unknown/release/erc20_peg.wasm';
const wasmBuffer = fs.readFileSync(wasmPath);
const wasmHex = wasmBuffer.toString('hex');
console.log('WASM size:', wasmHex.length / 2, 'bytes');

// Factory spawn protostone for USDC (6 decimals)
const protostone = '[4,65522,6,0,6]:v0:v0';
console.log('Protostone:', protostone);

// Execute with auto_confirm
const options = JSON.stringify({
  trace_enabled: false,
  mine_enabled: true,  // Remote regtest supports mining
  auto_confirm: true
});

console.log('\nExecuting factory spawn...');
console.log('Please wait...\n');

try {
  const result = await provider.alkanesExecuteWithStrings(
    JSON.stringify(['p2wpkh:0']),  // from addresses
    'B:50000000',                    // 0.5 BTC budget (larger to select better UTXOs)
    protostone,
    2,                              // fee rate
    wasmHex,
    options
  );

  console.log('=== DEPLOYMENT RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  if (result && typeof result === 'object') {
    if (result.complete) {
      console.log('\n=== DEPLOYMENT COMPLETE ===');
      console.log('Commit TXID:', result.complete.commit_txid);
      console.log('Reveal TXID:', result.complete.reveal_txid);
    }

    if (result.readyToSignCommit) {
      console.log('\n=== READY TO SIGN ===');
      console.log('PSBT needs signing. Fee:', result.readyToSignCommit.fee);
    }
  }

} catch (err) {
  console.error('\n=== ERROR ===');
  console.error('Error message:', err.message || err);
  if (err.stack) {
    console.error('Stack:', err.stack.split('\n').slice(0, 5).join('\n'));
  }
}

console.log('\nDone.');
