/**
 * Verify what addresses the SDK creates for the test mnemonic
 */

import { createWalletFromMnemonic, AlkanesProvider } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Use regtest network
const network = bitcoin.networks.regtest;

async function verifyAddresses() {
  console.log('=== SDK Address Verification ===\n');
  console.log('Mnemonic:', TEST_MNEMONIC);
  console.log('Network: regtest\n');

  // Create wallet using SDK
  const wallet = createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');
  const addresses = wallet.getAddresses();

  console.log('=== Addresses from SDK ===');
  console.log('Taproot:');
  console.log('  Address:', addresses.taproot?.address);
  console.log('  HD Path:', addresses.taproot?.hdPath);
  console.log('');
  console.log('Native SegWit:');
  console.log('  Address:', addresses.nativeSegwit?.address);
  console.log('  HD Path:', addresses.nativeSegwit?.hdPath);
  console.log('');

  // Now check balance on both addresses
  console.log('=== Checking Balances ===\n');

  const api = new AlkanesProvider({
    url: 'http://localhost:18888',
    dataApiUrl: 'http://localhost:50010',
    network: network,
    networkType: 'regtest',
  });

  if (addresses.nativeSegwit?.address) {
    console.log('Checking native segwit balance...');
    try {
      const info = await api.esplora.getAddressInfo(addresses.nativeSegwit.address);
      console.log('Native SegWit stats:', info.chain_stats);
    } catch (e) {
      console.log('Error fetching native segwit:', e.message);
    }
  }

  if (addresses.taproot?.address) {
    console.log('\nChecking taproot balance...');
    try {
      const info = await api.esplora.getAddressInfo(addresses.taproot.address);
      console.log('Taproot stats:', info.chain_stats);
    } catch (e) {
      console.log('Error fetching taproot:', e.message);
    }
  }

  // Try to get UTXOs
  console.log('\n=== Fetching UTXOs ===');
  if (addresses.nativeSegwit?.address) {
    try {
      const utxos = await api.getAddressUtxos(addresses.nativeSegwit.address);
      console.log(`Native SegWit UTXOs: ${utxos.utxos?.length || 0}`);
      console.log(`Spendable balance: ${utxos.spendableTotalBalance} sats`);
    } catch (e) {
      console.log('Error fetching UTXOs:', e.message);
    }
  }
}

verifyAddresses().catch(console.error);
