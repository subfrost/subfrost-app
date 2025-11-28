/**
 * Quick test to verify alkane UTXO enrichment works
 * Run: npx ts-node e2e/test-alkane-utxos.ts
 */

async function testAlkaneUtxos() {
  console.log('Testing Alkane UTXO enrichment...\n');

  const { AlkanesProvider } = await import('@alkanes/ts-sdk');
  const bitcoin = require('bitcoinjs-lib');

  // Create provider for regtest
  const provider = new AlkanesProvider({
    url: 'http://localhost:18888',
    dataApiUrl: 'http://localhost:50010',
    network: bitcoin.networks.regtest,
    networkType: 'regtest',
  });

  // Test with miner address that has UTXOs
  const testAddress = 'bcrt1q00j2kvd0mdjr222jd32cr3pa0vt5xxuvcea4rs';

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
