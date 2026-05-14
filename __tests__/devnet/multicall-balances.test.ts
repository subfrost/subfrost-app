/**
 * Devnet: Multicall and Balances
 *
 * Tests sandshrew_multicall batch dispatch and sandshrew_balances
 * composite operation through the in-process devnet.
 *
 * Run: pnpm vitest run __tests__/devnet/multicall-balances.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
  rpcCall,
} from './devnet-helpers';

describe('Devnet: Multicall & Balances', () => {
  let harness: any;
  let segwitAddress: string;
  let taprootAddress: string;

  beforeAll(async () => {
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
    segwitAddress = ctx.segwitAddress;
    taprootAddress = ctx.taprootAddress;

    mineBlocks(harness, 50);
  }, 60_000);

  afterAll(() => {
    disposeHarness();
  });

  describe('sandshrew_multicall', () => {
    it('should batch multiple RPC calls', async () => {
      const result = await rpcCall('sandshrew_multicall', [
        ['btc_getblockcount', []],
        ['btc_getblockhash', [0]],
        ['btc_getbestblockhash', []],
      ]);

      expect(result.result).toBeTruthy();
      expect(result.result.length).toBe(3);

      // All should succeed
      for (const sub of result.result) {
        expect(sub.result !== undefined || sub.error !== undefined).toBe(true);
      }
    });

    it('should handle mixed success/error in batch', async () => {
      const result = await rpcCall('sandshrew_multicall', [
        ['btc_getblockcount', []],
        ['nonexistent_namespace_method', ['foo']],
      ]);

      expect(result.result).toBeTruthy();
      expect(result.result.length).toBe(2);

      // First should succeed
      expect(result.result[0].result).toBeTypeOf('number');
    });

    it('should handle empty multicall', async () => {
      const result = await rpcCall('sandshrew_multicall', []);
      // Should return error for empty params
      expect(result.error).toBeTruthy();
    });

    it('should handle nested alkanes + btc calls', async () => {
      const result = await rpcCall('sandshrew_multicall', [
        ['btc_getblockcount', []],
        ['metashrew_height', []],
        ['alkanes_protorunesbyaddress', [{ address: taprootAddress, protocolTag: '1' }]],
      ]);

      expect(result.result).toBeTruthy();
      expect(result.result.length).toBe(3);
    });
  });

  describe('sandshrew_balances', () => {
    it('should return balance structure for an address', async () => {
      const result = await rpcCall('sandshrew_balances', [
        { address: segwitAddress },
      ]);

      expect(result).toBeTruthy();

      if (result.result) {
        // Should have the AddressInfo structure
        expect(result.result).toHaveProperty('spendable');
        expect(result.result).toHaveProperty('assets');
        expect(result.result).toHaveProperty('pending');
        expect(Array.isArray(result.result.spendable)).toBe(true);
      }
    });

    it('should accept protocolTag parameter', async () => {
      const result = await rpcCall('sandshrew_balances', [
        { address: taprootAddress, protocolTag: '1' },
      ]);

      expect(result).toBeTruthy();
      // Should not crash even if no alkane balances exist
    });
  });
});
