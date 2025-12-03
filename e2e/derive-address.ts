/**
 * Derive wallet address from test mnemonic using bitcoinjs-lib
 */

import * as bitcoin from 'bitcoinjs-lib';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';

const bip32 = BIP32Factory(ecc);

const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Use regtest network
const network = bitcoin.networks.regtest;

async function deriveAddress() {
  console.log('🔑 Deriving addresses from test mnemonic...\n');
  console.log('Mnemonic:', TEST_MNEMONIC);
  console.log('Network: regtest\n');

  // Generate seed from mnemonic
  const seed = await bip39.mnemonicToSeed(TEST_MNEMONIC);
  const root = bip32.fromSeed(seed, network);

  // BIP84 (Native SegWit) - m/84'/0'/0'/0/0
  // For regtest, we use coinType 0 (same as mainnet)
  const bip84Path = "m/84'/0'/0'/0/0";
  const bip84Node = root.derivePath(bip84Path);
  const { address: bip84Address } = bitcoin.payments.p2wpkh({
    pubkey: bip84Node.publicKey,
    network,
  });
  console.log('BIP84 (Native SegWit):');
  console.log('  Path:', bip84Path);
  console.log('  Address:', bip84Address);

  // BIP86 (Taproot) - m/86'/0'/0'/0/0
  const bip86Path = "m/86'/0'/0'/0/0";
  const bip86Node = root.derivePath(bip86Path);
  const xOnlyPubkey = bip86Node.publicKey.slice(1, 33); // Remove prefix byte for x-only
  const { address: bip86Address } = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network,
  });
  console.log('\nBIP86 (Taproot):');
  console.log('  Path:', bip86Path);
  console.log('  Address:', bip86Address);

  // BIP44 (Legacy) - m/44'/0'/0'/0/0
  const bip44Path = "m/44'/0'/0'/0/0";
  const bip44Node = root.derivePath(bip44Path);
  const { address: bip44Address } = bitcoin.payments.p2pkh({
    pubkey: bip44Node.publicKey,
    network,
  });
  console.log('\nBIP44 (Legacy):');
  console.log('  Path:', bip44Path);
  console.log('  Address:', bip44Address);

  // BIP49 (Nested SegWit) - m/49'/0'/0'/0/0
  const bip49Path = "m/49'/0'/0'/0/0";
  const bip49Node = root.derivePath(bip49Path);
  const { address: bip49Address } = bitcoin.payments.p2sh({
    redeem: bitcoin.payments.p2wpkh({
      pubkey: bip49Node.publicKey,
      network,
    }),
    network,
  });
  console.log('\nBIP49 (Nested SegWit):');
  console.log('  Path:', bip49Path);
  console.log('  Address:', bip49Address);

  console.log('\n========================================');
  console.log('PRIMARY ADDRESS (BIP84 Native SegWit):');
  console.log(bip84Address);
  console.log('========================================\n');

  return { bip84Address, bip86Address, bip44Address, bip49Address };
}

deriveAddress().catch(console.error);
