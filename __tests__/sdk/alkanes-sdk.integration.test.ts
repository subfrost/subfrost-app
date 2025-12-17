/**
 * Integration tests for @alkanes/ts-sdk WASM WebProvider
 *
 * These tests verify that our usage of the WASM WebProvider is correct by running
 * against the subfrost-regtest backend (https://regtest.subfrost.io)
 *
 * Run with: pnpm test:sdk
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Import WASM types
type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('@alkanes/ts-sdk WASM WebProvider Integration Tests', () => {
  let provider: WebProvider;
  let wasm: typeof import('@alkanes/ts-sdk/wasm');

  // Test address on regtest
  const TEST_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

  // Config overrides for subfrost-regtest - use JSON-RPC endpoint
  const REGTEST_CONFIG = {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  };

  beforeAll(async () => {
    // Dynamically import the WASM module
    wasm = await import('@alkanes/ts-sdk/wasm');

    // Create provider for subfrost-regtest with proper JSON-RPC config
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);
  });

  describe('Provider Initialization', () => {
    it('should create WebProvider with correct preset', () => {
      expect(provider).toBeDefined();
    });

    it('should have sandshrew_rpc_url method', () => {
      expect(typeof provider.sandshrew_rpc_url).toBe('function');
      const url = provider.sandshrew_rpc_url();
      expect(typeof url).toBe('string');
      expect(url.length).toBeGreaterThan(0);
      console.log('[Test] RPC URL:', url);
    });

    it('should have esplora methods', () => {
      expect(typeof provider.esploraGetAddressUtxo).toBe('function');
      expect(typeof provider.esploraGetAddressInfo).toBe('function');
      expect(typeof provider.esploraGetTx).toBe('function');
      expect(typeof provider.esploraGetTxStatus).toBe('function');
      expect(typeof provider.esploraGetBlocksTipHeight).toBe('function');
      expect(typeof provider.esploraBroadcastTx).toBe('function');
    });

    it('should have alkanes methods', () => {
      expect(typeof provider.alkanesExecute).toBe('function');
      expect(typeof provider.alkanesSimulate).toBe('function');
      expect(typeof provider.alkanesBalance).toBe('function');
      expect(typeof provider.alkanesBytecode).toBe('function');
      expect(typeof provider.alkanesByAddress).toBe('function');
      expect(typeof provider.alkanesTrace).toBe('function');
    });

    it('should have wallet methods', () => {
      expect(typeof provider.walletGetBalance).toBe('function');
      expect(typeof provider.walletGetUtxos).toBe('function');
      expect(typeof provider.walletCreate).toBe('function');
      expect(typeof provider.walletSend).toBe('function');
    });

    it('should have data API methods', () => {
      expect(typeof provider.dataApiGetBitcoinPrice).toBe('function');
      expect(typeof provider.dataApiGetAddressBalances).toBe('function');
      expect(typeof provider.dataApiGetPools).toBe('function');
    });
  });

  describe('Esplora API (via JSON-RPC)', () => {
    it('should fetch block tip height', async () => {
      const height = await provider.esploraGetBlocksTipHeight();
      expect(typeof height).toBe('number');
      expect(height).toBeGreaterThanOrEqual(0);
      console.log('[Test] Block height:', height);
    });

    it('should fetch block tip hash', async () => {
      const hash = await provider.esploraGetBlocksTipHash();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // Block hash is 64 hex chars
      console.log('[Test] Block hash:', hash);
    });

    it('should fetch address UTXOs (may be empty)', async () => {
      const utxos = await provider.esploraGetAddressUtxo(TEST_ADDRESS);

      // Should return an array (may be empty if address has no UTXOs)
      expect(Array.isArray(utxos)).toBe(true);
      console.log('[Test] UTXOs for test address:', utxos.length);

      // If UTXOs exist, verify structure (may be Map or Object)
      if (utxos.length > 0) {
        const utxo = utxos[0];
        // Handle both Map and Object responses from WASM
        const hasTxid = utxo instanceof Map ? utxo.has('txid') : 'txid' in utxo;
        const hasVout = utxo instanceof Map ? utxo.has('vout') : 'vout' in utxo;
        const hasValue = utxo instanceof Map ? utxo.has('value') : 'value' in utxo;

        console.log('[Test] UTXO structure:', { hasTxid, hasVout, hasValue, type: utxo instanceof Map ? 'Map' : 'Object' });
        expect(hasTxid).toBe(true);
        expect(hasVout).toBe(true);
        expect(hasValue).toBe(true);
      }
    });

    it('should fetch address info', async () => {
      const info = await provider.esploraGetAddressInfo(TEST_ADDRESS);

      expect(info).toBeDefined();
      // The response format may vary - just check we got data
      console.log('[Test] Address info:', JSON.stringify(info).slice(0, 200));
    });
  });

  describe('Metashrew API', () => {
    it('should fetch metashrew height', async () => {
      const height = await provider.metashrewHeight();
      expect(typeof height).toBe('number');
      expect(height).toBeGreaterThanOrEqual(0);
      console.log('[Test] Metashrew height:', height);
    });
  });

  describe('Enriched Balances', () => {
    it('should fetch enriched balances for address', async () => {
      const balances = await provider.getEnrichedBalances(TEST_ADDRESS);

      expect(balances).toBeDefined();
      console.log('[Test] Enriched balances:', JSON.stringify(balances).slice(0, 200));
    });
  });
});

describe('WebProvider API Surface Verification', () => {
  /**
   * This test documents and verifies all the methods we use in the application.
   * If any of these fail, we need to update our application code.
   */

  let provider: WebProvider;

  // Config overrides for subfrost-regtest - use JSON-RPC endpoint
  const REGTEST_CONFIG = {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  };

  beforeAll(async () => {
    const wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);
  });

  it('should have all methods used by useEnrichedWalletData', () => {
    // Methods used in hooks/useEnrichedWalletData.ts
    expect(typeof provider.esploraGetAddressUtxo).toBe('function');
  });

  it('should have all methods used by AlkanesSDKContext', () => {
    // Methods used in context/AlkanesSDKContext.tsx
    expect(typeof provider.sandshrew_rpc_url).toBe('function');
    expect(typeof provider.dataApiGetBitcoinPrice).toBe('function');
  });

  it('should have all methods used for transaction operations', () => {
    expect(typeof provider.esploraBroadcastTx).toBe('function');
    expect(typeof provider.broadcastTransaction).toBe('function');
    expect(typeof provider.esploraGetTx).toBe('function');
    expect(typeof provider.getTransactionHex).toBe('function');
  });

  it('should have all methods used for alkanes operations', () => {
    expect(typeof provider.alkanesExecute).toBe('function');
    expect(typeof provider.alkanesSimulate).toBe('function');
    expect(typeof provider.alkanesByAddress).toBe('function');
    expect(typeof provider.alkanesGetAllPools).toBe('function');
    expect(typeof provider.ammGetPoolDetails).toBe('function');
  });
});
