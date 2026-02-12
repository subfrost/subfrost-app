/**
 * SDK Surface Coverage Tests
 *
 * Verifies that every SDK WebProvider method the app relies on
 * (after the sdk-consolidation refactor) is callable and returns data.
 *
 * These are integration tests that run against subfrost-regtest.
 * Run with: INTEGRATION=true pnpm test:sdk -- sdk-surface-coverage
 */

import { describe, it, expect, beforeAll } from 'vitest';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

const SKIP = !process.env.INTEGRATION;

describe.skipIf(SKIP)('SDK Surface Coverage — app-critical methods', () => {
  let provider: WebProvider;

  const REGTEST_CONFIG = {
    jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
    data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
  };

  // Known regtest address (may or may not have UTXOs)
  const TEST_ADDRESS = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

  beforeAll(async () => {
    const wasm = await import('@alkanes/ts-sdk/wasm');
    provider = new wasm.WebProvider('subfrost-regtest', REGTEST_CONFIG);
  });

  // -----------------------------------------------------------------------
  // Esplora methods (used by buildAlkaneTransferPsbt, queries/account)
  // -----------------------------------------------------------------------

  describe('Esplora methods', () => {
    it('esploraGetAddressUtxo — returns array', async () => {
      const result = await provider.esploraGetAddressUtxo(TEST_ADDRESS);
      expect(Array.isArray(result)).toBe(true);
    });

    it('esploraGetTxHex — returns hex string for known tx', async () => {
      // Get a txid from UTXOs if any exist, otherwise skip
      const utxos = await provider.esploraGetAddressUtxo(TEST_ADDRESS);
      if (utxos.length === 0) {
        console.log('[skip] No UTXOs on test address, skipping esploraGetTxHex');
        return;
      }
      const txid = (utxos[0] as any).txid;
      const hex = await provider.esploraGetTxHex(txid);
      expect(typeof hex).toBe('string');
      expect(hex.length).toBeGreaterThan(0);
    });

    it('esploraGetAddressTxsMempool — returns array', async () => {
      const result = await provider.esploraGetAddressTxsMempool(TEST_ADDRESS);
      expect(Array.isArray(result)).toBe(true);
    });

    it('esploraGetBlocksTipHeight — returns positive number', async () => {
      const height = await provider.esploraGetBlocksTipHeight();
      expect(typeof height).toBe('number');
      expect(height).toBeGreaterThan(0);
    });

    it('esploraGetFeeEstimates — returns object', async () => {
      const result = await provider.esploraGetFeeEstimates();
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  // -----------------------------------------------------------------------
  // Data API methods (used by queries/account, hooks/useTokenNames, hooks/usePools)
  // -----------------------------------------------------------------------

  describe('Data API methods', () => {
    it('dataApiGetAlkanesByAddress — returns data', async () => {
      const result = await provider.dataApiGetAlkanesByAddress(TEST_ADDRESS);
      expect(result).toBeDefined();
      // May be empty array or { data: [] } depending on address
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const items = parsed?.data || parsed;
      expect(Array.isArray(items) || items === null || items === undefined).toBe(true);
    });

    it('dataApiGetAlkanes — returns tokens list', async () => {
      const result = await provider.dataApiGetAlkanes(BigInt(1), BigInt(10));
      expect(result).toBeDefined();
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const tokens = parsed?.data?.tokens || parsed?.tokens;
      expect(tokens === undefined || Array.isArray(tokens)).toBe(true);
    });

    it('dataApiGetAlkaneDetails — returns details for known token', async () => {
      const result = await provider.dataApiGetAlkaneDetails('2:0');
      expect(result).toBeDefined();
    });

    it('dataApiGetBlockHeight — returns height', async () => {
      const result = await provider.dataApiGetBlockHeight();
      expect(result).toBeDefined();
    });

    it('dataApiGetBitcoinPrice — returns price data', async () => {
      const result = await provider.dataApiGetBitcoinPrice();
      expect(result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Espo methods (used by alkanes-client, queries/market)
  // -----------------------------------------------------------------------

  describe('Espo methods', () => {
    it('espoGetHeight — returns positive number', async () => {
      const result = await provider.espoGetHeight();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('espoGetAlkaneInfo — returns data for known token', async () => {
      const result = await provider.espoGetAlkaneInfo('2:0');
      expect(result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Enriched balance methods (used by queries/account)
  // -----------------------------------------------------------------------

  describe('Enriched balances', () => {
    it('getEnrichedBalances — returns response', async () => {
      const result = await provider.getEnrichedBalances(TEST_ADDRESS);
      expect(result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Method existence checks (compile-time safety net)
  // -----------------------------------------------------------------------

  describe('Method existence', () => {
    const requiredMethods = [
      // Esplora
      'esploraGetAddressUtxo',
      'esploraGetTxHex',
      'esploraGetAddressTxsMempool',
      'esploraGetBlocksTipHeight',
      'esploraGetFeeEstimates',
      'esploraBroadcastTx',
      // Data API
      'dataApiGetAlkanesByAddress',
      'dataApiGetAlkanes',
      'dataApiGetAlkaneDetails',
      'dataApiGetBlockHeight',
      'dataApiGetBitcoinPrice',
      'dataApiGetAllPoolsDetails',
      // Espo
      'espoGetHeight',
      'espoGetAlkaneInfo',
      // Balance
      'getEnrichedBalances',
      // Broadcast
      'broadcastTransaction',
    ];

    for (const method of requiredMethods) {
      it(`provider.${method} exists`, () => {
        expect(typeof (provider as any)[method]).toBe('function');
      });
    }
  });
});
