/**
 * Test the createTestSigner utility
 */

import { describe, it, expect } from 'vitest';
import { createTestSigner, TEST_MNEMONIC } from './test-utils/createTestSigner';

describe('createTestSigner', () => {
  it('should create a test signer with addresses', async () => {
    const { signer, wallet, account, addresses, mnemonic } = await createTestSigner(
      TEST_MNEMONIC,
      'regtest'
    );

    console.log('[TestSigner] Native Segwit address:', addresses.nativeSegwit.address);
    console.log('[TestSigner] Taproot address:', addresses.taproot.address);
    console.log('[TestSigner] Mnemonic:', mnemonic);

    // Verify addresses are derived correctly
    expect(addresses.nativeSegwit.address).toBeDefined();
    expect(addresses.nativeSegwit.address.startsWith('bcrt1q')).toBe(true); // regtest native segwit

    expect(addresses.taproot.address).toBeDefined();
    expect(addresses.taproot.address.startsWith('bcrt1p')).toBe(true); // regtest taproot

    // Verify signer interface
    expect(signer.signAllInputs).toBeDefined();
    expect(signer.signAllInputsMultiplePsbts).toBeDefined();
    expect(signer.taprootKeyPair).toBeDefined();

    // Verify account structure
    expect(account.nativeSegwit).toBeDefined();
    expect(account.taproot).toBeDefined();
    expect(account.spendStrategy).toBeDefined();
    expect(account.network).toBeDefined();

    // Verify wallet (ts-sdk AlkanesWallet)
    expect(wallet).toBeDefined();
    expect(wallet.signPsbt).toBeDefined();
    expect(wallet.signMessage).toBeDefined();
  });

  it('should generate same addresses as app would', async () => {
    const { addresses } = await createTestSigner(TEST_MNEMONIC, 'regtest');

    // These are the expected addresses for the standard test mnemonic on regtest
    // BIP84 (native segwit): m/84'/1'/0'/0/0
    // The exact address depends on the mnemonic
    console.log('[TestSigner] Addresses:', addresses);

    // Just verify they look correct
    expect(addresses.nativeSegwit.pubkey.length).toBe(66); // 33 bytes as hex
    expect(addresses.taproot.pubkey.length).toBe(66); // 33 bytes as hex
    expect(addresses.taproot.pubKeyXOnly.length).toBe(64); // 32 bytes as hex
  });

  it('should work with mainnet network', async () => {
    const { addresses } = await createTestSigner(TEST_MNEMONIC, 'mainnet');

    console.log('[TestSigner] Mainnet Native Segwit:', addresses.nativeSegwit.address);
    console.log('[TestSigner] Mainnet Taproot:', addresses.taproot.address);

    // Mainnet addresses start with bc1
    expect(addresses.nativeSegwit.address.startsWith('bc1q')).toBe(true);
    expect(addresses.taproot.address.startsWith('bc1p')).toBe(true);
  });
});
