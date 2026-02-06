/**
 * Wallet Send Debug Test
 *
 * Debug test to understand the NotP2wpkhScript error in walletSend
 */

import { describe, it, expect, beforeAll } from 'vitest';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

const REGTEST_CONFIG = {
  jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
  data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
};

// Standard test mnemonic
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Expected addresses for this mnemonic on regtest:
// - P2WPKH (m/84'/1'/0'/0/0): bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk
// - P2TR (m/86'/1'/0'/0/0): bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg

describe.runIf(INTEGRATION)('Wallet Send Debug', () => {
  let provider: WebProvider;
  let wasm: typeof import('@alkanes/ts-sdk/wasm');

  beforeAll(async () => {
    wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);
    console.log('[Debug] WebProvider initialized');
  }, 60000);

  it('should show wallet addresses after loading mnemonic', async () => {
    // Load the mnemonic
    provider.walletLoadMnemonic(TEST_MNEMONIC, '');
    console.log('[Debug] Mnemonic loaded');

    // Get wallet info via walletCreate (this returns the taproot address)
    const walletInfo = await provider.walletCreate(TEST_MNEMONIC, '');
    console.log('[Debug] walletCreate result:', JSON.stringify(walletInfo));

    // Try to get UTXOs for both P2WPKH and P2TR addresses
    const p2wpkhAddress = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
    const p2trAddress = 'bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg';

    console.log('[Debug] Expected P2WPKH address:', p2wpkhAddress);
    console.log('[Debug] Expected P2TR address:', p2trAddress);

    // Get UTXOs for P2WPKH address
    try {
      const p2wpkhUtxos = await provider.walletGetUtxos([p2wpkhAddress]);
      console.log('[Debug] P2WPKH UTXOs:', JSON.stringify(p2wpkhUtxos));
    } catch (e: any) {
      console.log('[Debug] P2WPKH UTXOs error:', e.message);
    }

    // Get UTXOs for P2TR address
    try {
      const p2trUtxos = await provider.walletGetUtxos([p2trAddress]);
      console.log('[Debug] P2TR UTXOs:', JSON.stringify(p2trUtxos));
    } catch (e: any) {
      console.log('[Debug] P2TR UTXOs error:', e.message);
    }

    // Get all wallet UTXOs (no address filter)
    try {
      const allUtxos = await provider.walletGetUtxos(undefined);
      console.log('[Debug] All wallet UTXOs:', JSON.stringify(allUtxos));
    } catch (e: any) {
      console.log('[Debug] All wallet UTXOs error:', e.message);
    }

    expect(true).toBe(true);
  });

  it('should attempt walletSend with P2WPKH address and show detailed error', async () => {
    provider.walletLoadMnemonic(TEST_MNEMONIC, '');

    const p2wpkhAddress = 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk';
    const recipient = 'bcrt1qs52wg59emg847ld37v2dc8f7ruz2e83xj9j555';

    // First check if we have any UTXOs
    const utxos = await provider.walletGetUtxos([p2wpkhAddress]);
    console.log('[Debug] UTXOs for send:', JSON.stringify(utxos));

    if (!utxos || utxos.length === 0) {
      console.log('[Debug] No UTXOs available - skipping send test');
      return;
    }

    // Calculate total available
    const totalAvailable = utxos.reduce((sum: number, u: any) => sum + (u.amount || 0), 0);
    console.log('[Debug] Total available:', totalAvailable, 'sats');

    if (totalAvailable < 10000) {
      console.log('[Debug] Insufficient funds - skipping send test');
      return;
    }

    // Try to send
    const sendParams = {
      address: recipient,
      amount: 1000, // Small amount
      fee_rate: 1,
      from: [p2wpkhAddress],
      lock_alkanes: true,
      auto_confirm: true,
    };

    console.log('[Debug] Send params:', JSON.stringify(sendParams));

    try {
      const result = await provider.walletSend(JSON.stringify(sendParams));
      console.log('[Debug] Send result:', result);
      expect(result).toBeDefined();
    } catch (e: any) {
      console.log('[Debug] Send error:', e.message);
      console.log('[Debug] Full error:', e);
      // Re-throw to fail the test with details
      throw e;
    }
  });
});
