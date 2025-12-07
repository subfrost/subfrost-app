/**
 * Debug test to patch the ts-sdk's internal bitcoinjs-lib
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as ecc from '@bitcoinerlab/secp256k1';

describe('Patch ts-sdk bitcoinjs-lib', () => {
  beforeAll(() => {
    // We need to patch before ts-sdk is imported
    console.log('[Patch] Setting up patch...');
  });

  it('should identify the issue with bundled isPoint', async () => {
    console.log('[Patch] Step 1: Import ts-sdk to see how it works...');

    // Import ts-sdk
    const sdk = await import('@alkanes/ts-sdk');

    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const wallet = sdk.createWalletFromMnemonic(mnemonic, 'regtest');

    // Get the derived node
    const childNode = wallet.accountNode.derive(0).derive(0);
    const pubkey = childNode.publicKey;

    console.log('[Patch] Pubkey:', pubkey.toString('hex'));
    console.log('[Patch] Buffer.isBuffer(pubkey):', Buffer.isBuffer(pubkey));

    // Check with external ecc
    console.log('[Patch] External ecc.isPoint(pubkey):', ecc.isPoint(pubkey));

    // The issue: ts-sdk's bundled bitcoinjs-lib types.isPoint checks:
    // - Buffer.isBuffer(p) - but the pubkey might be a Uint8Array
    // Let's check if pubkey is really a Buffer or Uint8Array
    console.log('[Patch] pubkey instanceof Buffer:', pubkey instanceof Buffer);
    console.log('[Patch] pubkey instanceof Uint8Array:', pubkey instanceof Uint8Array);
    console.log('[Patch] pubkey.constructor.name:', pubkey.constructor.name);

    // Try to create a fresh Buffer from the pubkey
    const pubkeyBuf = Buffer.from(pubkey);
    console.log('[Patch] pubkeyBuf instanceof Buffer:', pubkeyBuf instanceof Buffer);
    console.log('[Patch] Buffer.isBuffer(pubkeyBuf):', Buffer.isBuffer(pubkeyBuf));

    // Compare
    console.log('[Patch] pubkey === pubkeyBuf:', pubkey === pubkeyBuf);
    console.log('[Patch] pubkey.equals(pubkeyBuf):', pubkey.equals(pubkeyBuf));
  });

  it('should check if deriveAddress uses different pubkey', async () => {
    // Monkey-patch the ts-sdk dist file to log what pubkey it receives
    console.log('[Check] Let me check what deriveAddress actually passes to p2wpkh...');

    const sdk = await import('@alkanes/ts-sdk');
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const wallet = sdk.createWalletFromMnemonic(mnemonic, 'regtest');

    // Get pubkey same way deriveAddress does
    const childNode = wallet.accountNode.derive(0).derive(0);
    const pubkey = childNode.publicKey;

    // Now check with our own bitcoinjs-lib
    const bitcoin = await import('bitcoinjs-lib');
    bitcoin.initEccLib(ecc);

    console.log('[Check] Trying p2wpkh with our bitcoinjs-lib...');
    const payment = bitcoin.payments.p2wpkh({
      pubkey: pubkey as Buffer,
      network: bitcoin.networks.regtest,
    });

    console.log('[Check] Success! Address:', payment.address);

    // The external bitcoinjs-lib works because we initialized its ecc
    // But ts-sdk's bundled bitcoinjs-lib doesn't have ecc initialized

    expect(payment.address).toBeDefined();
  });

  it('should try manually initializing ts-sdk bundled ecc', async () => {
    console.log('[ManualInit] Attempting to initialize ts-sdk bundled ecc...');

    // The ts-sdk bundles @bitcoinerlab/secp256k1 which is accessed via require_dist2()
    // We need to somehow initialize the bundled bitcoinjs-lib's ecc

    // First, let's see if we can access the bundled bitcoin module
    const sdk = await import('@alkanes/ts-sdk');

    // The SDK might expose the initialized bitcoin instance somewhere
    console.log('[ManualInit] SDK exports:', Object.keys(sdk));

    // Check if there's a way to access internal modules
    // The wallet module uses bitcoin2 internally, which should have initEccLib called

    // Let's try a different approach - directly call the bundled initEccLib
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const wallet = sdk.createWalletFromMnemonic(mnemonic, 'regtest');

    // Since the wallet creation doesn't throw, the issue might be in the deriveAddress path
    // Let's see if we can work around by using a lower-level approach

    try {
      // This will fail, but let's capture more info
      const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
      console.log('[ManualInit] Somehow succeeded:', addrInfo.address);
    } catch (e: any) {
      console.log('[ManualInit] Failed as expected:', e.message);

      // The workaround: use our own bitcoinjs-lib to generate the address
      const bitcoin = await import('bitcoinjs-lib');
      bitcoin.initEccLib(ecc);

      const childNode = wallet.accountNode.derive(0).derive(0);
      const pubkey = Buffer.from(childNode.publicKey);

      const payment = bitcoin.payments.p2wpkh({
        pubkey,
        network: bitcoin.networks.regtest,
      });

      console.log('[ManualInit] Workaround address:', payment.address);
      expect(payment.address).toBeDefined();
    }
  });
});
