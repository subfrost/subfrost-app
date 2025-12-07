/**
 * Debug test to understand why isPoint fails
 */

import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';

describe('isPoint Debug', () => {
  it('should test if pubkey passes isPoint check', async () => {
    console.log('[isPoint] Step 1: Init ecc...');
    bitcoin.initEccLib(ecc);

    console.log('[isPoint] Step 2: Create BIP32...');
    const bip32 = BIP32Factory(ecc);

    console.log('[isPoint] Step 3: Generate seed...');
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed = bip39.mnemonicToSeedSync(mnemonic);

    console.log('[isPoint] Step 4: Create root...');
    const root = bip32.fromSeed(seed, bitcoin.networks.regtest);

    console.log('[isPoint] Step 5: Derive key...');
    const path = "m/84'/1'/0'/0/0";
    const child = root.derivePath(path);

    console.log('[isPoint] Step 6: Get pubkey...');
    const pubkey = child.publicKey;
    console.log('[isPoint] Pubkey:', pubkey.toString('hex'));
    console.log('[isPoint] Pubkey length:', pubkey.length);
    console.log('[isPoint] First byte:', pubkey[0]);

    // Check if it's a valid point
    const isValidPoint = ecc.isPoint(pubkey);
    console.log('[isPoint] ecc.isPoint result:', isValidPoint);

    // Now try p2wpkh
    console.log('[isPoint] Step 7: Create p2wpkh...');
    const payment = bitcoin.payments.p2wpkh({
      pubkey,
      network: bitcoin.networks.regtest,
    });

    console.log('[isPoint] Address:', payment.address);
    expect(payment.address).toBeDefined();
  });

  it('should trace through ts-sdk wallet code', async () => {
    console.log('[Trace] Step 1: Init local bitcoinjs-lib...');
    bitcoin.initEccLib(ecc);

    const bip32 = BIP32Factory(ecc);
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, bitcoin.networks.regtest);

    // This is what deriveAddress does:
    const derivationPath = "m/84'/1'/0'";
    const accountNode = root.derivePath(derivationPath);

    // deriveAddress('p2wpkh', 0, 0)
    const change = 0;
    const index = 0;
    const childNode = accountNode.derive(change).derive(index);
    const pubkey = childNode.publicKey;

    console.log('[Trace] Pubkey from local code:', pubkey.toString('hex'));
    console.log('[Trace] Pubkey length:', pubkey.length);

    // This should work
    const payment = bitcoin.payments.p2wpkh({
      pubkey,
      network: bitcoin.networks.regtest,
    });

    console.log('[Trace] Address from local code:', payment.address);
    expect(payment.address).toBeDefined();

    // Now import ts-sdk and compare
    console.log('[Trace] Step 2: Import ts-sdk...');
    const sdk = await import('@alkanes/ts-sdk');

    console.log('[Trace] Step 3: Create wallet via ts-sdk...');
    const wallet = sdk.createWalletFromMnemonic(mnemonic, 'regtest');

    // The wallet has root and accountNode
    console.log('[Trace] Wallet accountNode:', wallet.accountNode);

    // Try to get the pubkey that ts-sdk would use
    const sdkChild = wallet.accountNode.derive(0).derive(0);
    const sdkPubkey = sdkChild.publicKey;

    console.log('[Trace] Pubkey from ts-sdk wallet:', sdkPubkey?.toString('hex'));
    console.log('[Trace] Pubkey type:', typeof sdkPubkey, sdkPubkey?.constructor?.name);

    // Check if it's a valid point according to our ecc
    if (sdkPubkey) {
      // Convert to Buffer if it's Uint8Array
      const pubkeyBuf = Buffer.isBuffer(sdkPubkey) ? sdkPubkey : Buffer.from(sdkPubkey);
      console.log('[Trace] As buffer:', pubkeyBuf.toString('hex'));
      console.log('[Trace] ecc.isPoint(sdkPubkey):', ecc.isPoint(pubkeyBuf));
    }

    // Now try deriveAddress
    console.log('[Trace] Step 4: Call deriveAddress...');
    try {
      const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
      console.log('[Trace] SUCCESS! Address:', addrInfo.address);
      expect(addrInfo.address).toBeDefined();
    } catch (e: any) {
      console.log('[Trace] deriveAddress failed:', e.message);
      throw e;
    }
  });
});
