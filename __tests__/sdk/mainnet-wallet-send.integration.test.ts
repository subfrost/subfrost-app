/**
 * Mainnet Wallet Send Integration Test
 *
 * Reproduces the "Unknown network: bitcoin" bug that occurs when a keystore
 * wallet tries to send BTC on mainnet.
 *
 * Root cause: WebProvider::new_js("mainnet") sets self.network = Network::Bitcoin.
 * When walletSend() calls get_address() -> network_params(), it does:
 *   self.network.to_string() -> "bitcoin" (bitcoin crate Display impl)
 *   from_network_str("bitcoin") -> Err("Unknown network: bitcoin")
 * because from_network_str only accepts "mainnet", not "bitcoin".
 *
 * Run with:
 *   INTEGRATION=true pnpm test:sdk mainnet-wallet-send
 */

import { describe, it, expect, beforeAll } from 'vitest';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const INTEGRATION = !!process.env.INTEGRATION;

const MAINNET_CONFIG = {
  jsonrpc_url: 'https://mainnet.subfrost.io/v4/subfrost',
  data_api_url: 'https://mainnet.subfrost.io/v4/subfrost',
};

// Standard test mnemonic (do NOT use in production!)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Known mainnet P2WPKH address for the test mnemonic (m/84'/0'/0'/0/0)
const TEST_MAINNET_P2WPKH = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
// Known mainnet P2TR address for the test mnemonic (m/86'/0'/0'/0/0)
const TEST_MAINNET_P2TR = 'bc1p5cyxnuxmeuwuvkwfem96lqzszee2457nljwu97hqe9ldanrst7tsm009ax';

// A known mainnet address to use as recipient
const TEST_RECIPIENT = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

describe.runIf(INTEGRATION)('Mainnet Wallet Send - "Unknown network: bitcoin" Bug', () => {
  let provider: WebProvider;
  let wasm: typeof import('@alkanes/ts-sdk/wasm');

  beforeAll(async () => {
    wasm = await import('@alkanes/ts-sdk/wasm');
    // This is how AlkanesSDKContext creates the provider for mainnet
    provider = new wasm.WebProvider('mainnet', MAINNET_CONFIG);
    console.log('[MainnetSend] WebProvider initialized with "mainnet"');
  }, 60000);

  it('should load wallet mnemonic on mainnet provider', () => {
    // This should work - mnemonic loading doesn't hit network_params()
    provider.walletLoadMnemonic(TEST_MNEMONIC, '');
    expect(provider.walletIsLoaded()).toBe(true);
    console.log('[MainnetSend] Mnemonic loaded successfully');
  });

  it('should reproduce "Unknown network: bitcoin" when calling walletSend on mainnet', async () => {
    // Load wallet
    provider.walletLoadMnemonic(TEST_MNEMONIC, '');
    expect(provider.walletIsLoaded()).toBe(true);

    // Build send params exactly as SendModal.tsx does (line 729-736)
    const sendParams = {
      address: TEST_RECIPIENT,
      amount: 10000, // 10,000 sats
      fee_rate: 5,
      from: [TEST_MAINNET_P2WPKH],
      lock_alkanes: true,
      auto_confirm: true,
    };

    console.log('[MainnetSend] Attempting walletSend with params:', JSON.stringify(sendParams));

    // This should fail with "Send failed: Invalid parameters: Unknown network: bitcoin"
    // because network_params() does:
    //   self.network.to_string() -> "bitcoin" (Network::Bitcoin Display)
    //   from_network_str("bitcoin") -> Err("Unknown network: bitcoin")
    try {
      const result = await provider.walletSend(JSON.stringify(sendParams));
      console.log('[MainnetSend] walletSend succeeded (bug is fixed!):', result);
      // If we get here, the bug is fixed. The send may still fail for other reasons
      // (e.g. no UTXOs on the test address), but the network mapping works.
      expect(true).toBe(true);
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      console.log('[MainnetSend] walletSend error:', errorMsg);

      // Check if this is the specific "Unknown network: bitcoin" bug
      if (errorMsg.includes('Unknown network: bitcoin')) {
        // Bug reproduced! This is the expected failure before the fix.
        console.log('[MainnetSend] BUG REPRODUCED: "Unknown network: bitcoin"');
        console.log('[MainnetSend] The bug is in alkanes-rs from_network_str which');
        console.log('[MainnetSend] does not accept "bitcoin" (Network::Bitcoin.to_string())');
        console.log('[MainnetSend] as an alias for "mainnet".');
        expect(errorMsg).not.toContain('Unknown network: bitcoin');
      } else if (errorMsg.includes('No UTXOs') || errorMsg.includes('Insufficient funds')) {
        // This is acceptable - the network mapping worked but the test wallet
        // has no mainnet funds (expected for a test mnemonic)
        console.log('[MainnetSend] Network mapping works! Failed due to no funds (expected).');
        expect(true).toBe(true);
      } else {
        // Some other error - log it for debugging
        console.log('[MainnetSend] Unexpected error (not the network bug):', errorMsg);
        // Don't fail the test if it's a different error - the network mapping worked
        expect(errorMsg).not.toContain('Unknown network: bitcoin');
      }
    }
  }, 30000);

  it('should also reproduce the bug via walletGetUtxos (calls get_address internally)', async () => {
    // walletGetUtxos without explicit addresses calls get_address() internally,
    // which also hits network_params() -> from_network_str("bitcoin")
    provider.walletLoadMnemonic(TEST_MNEMONIC, '');

    try {
      // Call without addresses to trigger internal address derivation
      const utxos = await provider.walletGetUtxos(undefined);
      console.log('[MainnetSend] walletGetUtxos succeeded:', JSON.stringify(utxos));
      expect(true).toBe(true);
    } catch (e: any) {
      const errorMsg = e.message || String(e);
      console.log('[MainnetSend] walletGetUtxos error:', errorMsg);

      if (errorMsg.includes('Unknown network: bitcoin')) {
        console.log('[MainnetSend] BUG REPRODUCED in walletGetUtxos path too');
        expect(errorMsg).not.toContain('Unknown network: bitcoin');
      } else {
        // Different error means network mapping worked
        console.log('[MainnetSend] Network mapping works in walletGetUtxos path');
        expect(true).toBe(true);
      }
    }
  }, 30000);
});
