/**
 * Test ts-sdk UTXO enrichment with alkane balances
 * This verifies that the getAddressUtxos method properly enriches
 * UTXOs with alkane balance data via protorunesbyoutpoint
 *
 * Run: node e2e/test-sdk-enrichment.mjs
 */

import { AlkanesProvider } from '../ts-sdk/dist/index.mjs';
import * as bitcoin from 'bitcoinjs-lib';

async function testAlkaneEnrichment() {
  console.log('Testing ts-sdk Alkane UTXO Enrichment...\n');

  // Create provider for regtest
  const provider = new AlkanesProvider({
    url: 'http://localhost:18888',
    dataApiUrl: 'http://localhost:50010',
    network: bitcoin.networks.regtest,
    networkType: 'regtest',
  });

  // Test with miner address that has many UTXOs (but no alkane tokens)
  const minerAddress = 'bcrt1q00j2kvd0mdjr222jd32cr3pa0vt5xxuvcea4rs';

  try {
    console.log(`1. Testing getAddressUtxos for ${minerAddress}...`);
    const result = await provider.getAddressUtxos(minerAddress);

    console.log(`   Found ${result.utxos.length} UTXOs`);
    console.log(`   Total spendable balance: ${result.spendableTotalBalance} sats\n`);

    // Show first 3 UTXOs with their alkane data
    console.log('2. Sample UTXO details (first 3):');
    for (const utxo of result.utxos.slice(0, 3)) {
      console.log(`   UTXO: ${utxo.txId}:${utxo.outputIndex}`);
      console.log(`     Satoshis: ${utxo.satoshis}`);
      console.log(`     Alkanes: ${JSON.stringify(utxo.alkanes)}`);
      console.log(`     Has alkanes property: ${utxo.hasOwnProperty('alkanes')}`);
      console.log('');
    }

    // Verify alkanes property exists on all UTXOs
    const hasAlkanesProperty = result.utxos.every(u => u.hasOwnProperty('alkanes'));
    console.log(`3. All UTXOs have 'alkanes' property: ${hasAlkanesProperty}`);

    // Test getAlkanesByOutpoint directly
    if (result.utxos.length > 0) {
      const firstUtxo = result.utxos[0];
      console.log(`\n4. Direct test of getAlkanesByOutpoint for ${firstUtxo.txId}:${firstUtxo.outputIndex}...`);

      try {
        const alkanes = await provider.getAlkanesByOutpoint(firstUtxo.txId, firstUtxo.outputIndex);
        console.log(`   Result: ${JSON.stringify(alkanes)}`);
        console.log(`   Type: ${typeof alkanes}`);
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════');
    console.log('✅ ts-sdk enrichment test completed!');
    console.log('═══════════════════════════════════════');
    console.log(`   Total UTXOs: ${result.utxos.length}`);
    console.log(`   All have alkanes property: ${hasAlkanesProperty}`);
    console.log(`   Expected: Empty alkanes {} for plain BTC UTXOs`);
    console.log('');
    console.log('Note: To test with actual alkane tokens, you need to:');
    console.log('  1. Execute a swap that sends tokens to an external address');
    console.log('  2. Or use wrap-btc CLI to mint frBTC to your address');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testAlkaneEnrichment().catch(console.error);
