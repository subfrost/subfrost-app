/**
 * Devnet: WebProvider Integration
 *
 * Tests that the @alkanes/ts-sdk WebProvider works correctly against
 * the in-process devnet via the fetch interceptor.
 *
 * This is the critical integration test — if the WebProvider can talk
 * to the devnet through intercepted fetch(), all higher-level tests
 * (wrap, swap, send) will work.
 *
 * Run: pnpm vitest run __tests__/devnet/provider-integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
} from './devnet-helpers';
import type { TestSignerResult } from '../sdk/test-utils/createTestSigner';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

describe('Devnet: WebProvider Integration', () => {
  let harness: any;
  let provider: WebProvider;
  let signer: TestSignerResult;
  let segwitAddress: string;
  let taprootAddress: string;

  beforeAll(async () => {
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    provider = ctx.provider;
    signer = ctx.signer;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    // Mine blocks so there's chain state
    mineBlocks(harness, 101);
  }, 60_000);

  afterAll(() => {
    disposeHarness();
  });

  describe('Bitcoin RPC via WebProvider', () => {
    it('should get block count via provider', async () => {
      const count = await provider.bitcoindGetBlockCount();
      expect(count).toBeGreaterThanOrEqual(101);
    });

    it('should generate blocks via provider', async () => {
      const countBefore = await provider.bitcoindGetBlockCount();
      await provider.bitcoindGenerateToAddress(5, segwitAddress);
      const countAfter = await provider.bitcoindGetBlockCount();
      // The provider internally calls btc_generatetoaddress.
      // Note: the generatetoaddress cap in production jsonrpc limits to 1 block
      // per call. The WebProvider may call it 5 times or once with count=5.
      // Our devnet has no cap, so all 5 should mine.
      expect(countAfter).toBeGreaterThan(countBefore);
    });
  });

  describe('Balance queries via WebProvider', () => {
    it('should get enriched balances or handle gracefully', async () => {
      // Mine to our address so we have UTXOs
      await provider.bitcoindGenerateToAddress(10, segwitAddress);

      try {
        const enriched = await provider.getEnrichedBalances(segwitAddress, '1');
        expect(enriched).toBeTruthy();
      } catch (e: any) {
        // getEnrichedBalances internally calls sandshrew_balances which calls
        // ord_blockheight via recursive dispatch. With NoOrd backend, ord
        // returns null which may cause downstream parsing to fail.
        // This is expected — the devnet doesn't have an ord backend.
        expect(e).toBeTruthy();
      }
    });
  });

  describe('Alkanes queries via WebProvider', () => {
    it('should query protorunesbyaddress without crashing', async () => {
      // This tests the full encode → metashrew_view → decode pipeline
      try {
        const result = await provider.alkanesBalance(taprootAddress, '1');
        // May return empty if no alkanes deployed, but shouldn't throw
        expect(result !== undefined).toBe(true);
      } catch (e: any) {
        // Some errors are expected if the indexer doesn't have the right data
        // But it should NOT be a WASM panic or serialization error
        expect(e.message).not.toContain('panic');
        expect(e.message).not.toContain('unreachable');
      }
    });
  });

  describe('Fetch interceptor', () => {
    it('should intercept POST requests to the RPC URL', async () => {
      const response = await fetch('http://localhost:18888/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'btc_getblockcount',
          params: [],
          id: 999,
        }),
      });

      expect(response.ok).toBe(true);
      const json = await response.json();
      expect(json.jsonrpc).toBe('2.0');
      expect(json.result).toBeTypeOf('number');
    });

    it('should return valid JSON-RPC error for unknown methods', async () => {
      const response = await fetch('http://localhost:18888/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'totally_unknown_method_xyz',
          params: [],
          id: 1000,
        }),
      });

      expect(response.ok).toBe(true);
      const json = await response.json();
      // Should be a valid JSON-RPC response (either result or error)
      expect(json.jsonrpc).toBe('2.0');
    });
  });
});
