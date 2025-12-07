/**
 * Debug test to understand the ecc initialization issue
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('ECC Initialization Debug', () => {
  it('should check if bitcoinjs-lib ecc is initialized after ts-sdk import', async () => {
    console.log('[Debug] Step 1: Importing ts-sdk...');

    // Import the ts-sdk
    const sdk = await import('@alkanes/ts-sdk');

    console.log('[Debug] Step 2: ts-sdk imported, checking exports...');
    console.log('[Debug] SDK keys:', Object.keys(sdk));

    // Check if createWalletFromMnemonic exists
    console.log('[Debug] createWalletFromMnemonic:', typeof sdk.createWalletFromMnemonic);

    // Try to import bitcoinjs-lib directly and check if ecc is set
    console.log('[Debug] Step 3: Importing bitcoinjs-lib...');
    const bitcoin = await import('bitcoinjs-lib');

    // Check if getEccLib returns something
    console.log('[Debug] Step 4: Checking getEccLib...');
    try {
      const eccLib = (bitcoin as any).getEccLib?.();
      console.log('[Debug] getEccLib result:', eccLib ? 'HAS_ECC' : 'NO_ECC');
    } catch (e: any) {
      console.log('[Debug] getEccLib error:', e.message);
    }

    // Now try to create wallet
    console.log('[Debug] Step 5: Creating wallet...');
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    try {
      const wallet = sdk.createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');
      console.log('[Debug] Wallet created successfully');
      console.log('[Debug] Wallet type:', typeof wallet);

      // Try deriveAddress
      console.log('[Debug] Step 6: Deriving address...');
      const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
      console.log('[Debug] Address derived:', addrInfo.address);

      expect(addrInfo.address).toBeDefined();
    } catch (e: any) {
      console.log('[Debug] Error:', e.message);
      console.log('[Debug] Stack:', e.stack?.slice(0, 500));
      throw e;
    }
  });

  it('should check if importing ecc manually helps', async () => {
    console.log('[Debug2] Step 1: Importing ecc library...');
    const ecc = await import('@bitcoinerlab/secp256k1');

    console.log('[Debug2] Step 2: Importing bitcoinjs-lib...');
    const bitcoin = await import('bitcoinjs-lib');

    console.log('[Debug2] Step 3: Manually initializing ecc...');
    try {
      bitcoin.initEccLib(ecc);
      console.log('[Debug2] initEccLib called successfully');
    } catch (e: any) {
      console.log('[Debug2] initEccLib error:', e.message);
    }

    console.log('[Debug2] Step 4: Now importing ts-sdk...');
    const sdk = await import('@alkanes/ts-sdk');

    console.log('[Debug2] Step 5: Creating wallet...');
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    try {
      const wallet = sdk.createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');
      console.log('[Debug2] Wallet created');

      const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
      console.log('[Debug2] Address:', addrInfo.address);

      expect(addrInfo.address).toBeDefined();
    } catch (e: any) {
      console.log('[Debug2] Error:', e.message);
      throw e;
    }
  });
});
