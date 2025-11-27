/**
 * Quick test to verify alkane UTXO enrichment works
 * Run: node e2e/test-alkane-utxos.mjs
 */

import { AlkanesProvider, createWalletFromMnemonic } from '../ts-sdk/dist/index.mjs';
import * as bitcoin from 'bitcoinjs-lib';

async function testAlkaneUtxos() {
  console.log('Testing Alkane UTXO enrichment...\n');

  // First, let's see what address the SDK derives from the test mnemonic
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  console.log('Creating wallet from test mnemonic...');

  try {
    const wallet = createWalletFromMnemonic(mnemonic, 'regtest');
    const segwitAddr = wallet.deriveAddress('p2wpkh', 0, 0);
    const taprootAddr = wallet.deriveAddress('p2tr', 0, 0);

    console.log('Derived addresses:');
    console.log('  Native SegWit (p2wpkh):', segwitAddr.address);
    console.log('  Taproot (p2tr):', taprootAddr.address);
    console.log('');
  } catch (e) {
    console.log('SDK wallet creation error (expected in Node.js):', e.message.slice(0, 100));
    console.log('');
  }

  // Create provider for regtest
  const provider = new AlkanesProvider({
    url: 'http://localhost:18888',
    dataApiUrl: 'http://localhost:50010',
    network: bitcoin.networks.regtest,
    networkType: 'regtest',
  });

  // Test with the funded native segwit address from test mnemonic
  const testAddress = 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx';

  try {
    console.log(`Fetching UTXOs for ${testAddress}...`);
    const result = await provider.getAddressUtxos(testAddress);

    console.log(`\nFound ${result.utxos.length} UTXOs`);
    console.log(`Total spendable balance: ${result.spendableTotalBalance} sats\n`);

    // Show first 3 UTXOs with their alkane data
    for (const utxo of result.utxos.slice(0, 3)) {
      console.log(`UTXO: ${utxo.txId}:${utxo.outputIndex}`);
      console.log(`  Satoshis: ${utxo.satoshis}`);
      console.log(`  Alkanes: ${JSON.stringify(utxo.alkanes)}`);
      console.log('');
    }

    // Test getAlkanesByOutpoint directly
    if (result.utxos.length > 0) {
      const firstUtxo = result.utxos[0];
      console.log(`\nDirect test of getAlkanesByOutpoint for ${firstUtxo.txId}:${firstUtxo.outputIndex}...`);
      const alkanes = await provider.getAlkanesByOutpoint(firstUtxo.txId, firstUtxo.outputIndex);
      console.log(`  Result: ${JSON.stringify(alkanes)}`);
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testAlkaneUtxos().catch(console.error);
