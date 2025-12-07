/**
 * Deep debug test to understand the ecc initialization issue
 */

import { describe, it, expect } from 'vitest';

describe('ECC Deep Debug', () => {
  it('should trace the exact initialization flow', async () => {
    console.log('[Deep] Step 1: Import ts-sdk module...');

    // Import the ts-sdk - this should trigger init_wallet() at module level
    const sdk = await import('@alkanes/ts-sdk');

    console.log('[Deep] Step 2: SDK imported');
    console.log('[Deep] createWalletFromMnemonic:', typeof sdk.createWalletFromMnemonic);

    // Try to access the internal bitcoin instance through wallet creation
    console.log('[Deep] Step 3: Creating wallet...');
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    const wallet = sdk.createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');
    console.log('[Deep] Step 4: Wallet created, type:', typeof wallet);
    console.log('[Deep] Wallet methods:', Object.keys(wallet));

    // The issue is in deriveAddress - let's see what happens
    console.log('[Deep] Step 5: Calling deriveAddress...');

    try {
      const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
      console.log('[Deep] SUCCESS! Address:', addrInfo.address);
      expect(addrInfo.address).toBeDefined();
    } catch (e: any) {
      console.log('[Deep] FAILED:', e.message);

      // Try to see if we can access bitcoin from the wallet
      console.log('[Deep] Wallet properties:', Object.getOwnPropertyNames(wallet));
      console.log('[Deep] Wallet prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(wallet)));

      throw e;
    }
  });

  it('should test if the SDK exports the bitcoin instance', async () => {
    console.log('[SDKExport] Checking SDK exports...');

    const sdk = await import('@alkanes/ts-sdk');

    // List all exports
    const exports = Object.keys(sdk);
    console.log('[SDKExport] All exports:', exports);

    // Check if there's an initSDK or init function
    if ('initSDK' in sdk) {
      console.log('[SDKExport] Found initSDK, calling...');
      try {
        await (sdk as any).initSDK();
        console.log('[SDKExport] initSDK completed');
      } catch (e: any) {
        console.log('[SDKExport] initSDK error:', e.message);
      }
    }

    // Now try wallet again
    const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const wallet = sdk.createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');

    try {
      const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
      console.log('[SDKExport] Address after initSDK:', addrInfo.address);
      expect(addrInfo.address).toBeDefined();
    } catch (e: any) {
      console.log('[SDKExport] Still failed:', e.message);
      throw e;
    }
  });

  it('should check if default export has different behavior', async () => {
    console.log('[Default] Testing default export...');

    // Try the default export which is an async getter
    const getSDK = (await import('@alkanes/ts-sdk')).default;
    console.log('[Default] getSDK type:', typeof getSDK);

    if (typeof getSDK === 'function') {
      console.log('[Default] Calling getSDK()...');
      const sdk = await getSDK();
      console.log('[Default] SDK from default:', Object.keys(sdk));

      const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const wallet = sdk.createWalletFromMnemonic(TEST_MNEMONIC, 'regtest');

      try {
        const addrInfo = wallet.deriveAddress('p2wpkh', 0, 0);
        console.log('[Default] SUCCESS with default export! Address:', addrInfo.address);
        expect(addrInfo.address).toBeDefined();
      } catch (e: any) {
        console.log('[Default] Failed with default export:', e.message);
        throw e;
      }
    } else {
      console.log('[Default] Default is not a function:', getSDK);
    }
  });
});
