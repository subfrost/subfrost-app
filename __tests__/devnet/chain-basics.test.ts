/**
 * Devnet: Chain basics
 *
 * Tests core chain operations via the in-process JSON-RPC server:
 * getblockcount, getblockhash, generatetoaddress, getbestblockhash.
 *
 * No external infrastructure needed — runs entirely in WASM.
 *
 * Run: pnpm vitest run __tests__/devnet/chain-basics.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDevnetTestContext,
  disposeHarness,
  rpcCall,
} from './devnet-helpers';

describe('Devnet: Chain Basics', () => {
  let harness: any;

  beforeAll(async () => {
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;
  }, 60_000);

  afterAll(() => {
    disposeHarness();
  });

  it('should report genesis height', async () => {
    const result = await rpcCall('btc_getblockcount', []);
    expect(result.result).toBe(0);
  });

  it('should return genesis block hash', async () => {
    const result = await rpcCall('btc_getblockhash', [0]);
    expect(result.result).toBeTruthy();
    expect(result.result.length).toBe(64);
  });

  it('should mine blocks and advance height', async () => {
    harness.mineBlocks(10);

    const result = await rpcCall('btc_getblockcount', []);
    expect(result.result).toBe(10);
  });

  it('should return best block hash', async () => {
    const result = await rpcCall('btc_getbestblockhash', []);
    expect(result.result).toBeTruthy();
    expect(result.result.length).toBe(64);

    // Should match the hash at current height
    const heightResult = await rpcCall('btc_getblockcount', []);
    const hashResult = await rpcCall('btc_getblockhash', [heightResult.result]);
    expect(result.result).toBe(hashResult.result);
  });

  it('should generate blocks to address via RPC', async () => {
    const heightBefore = (await rpcCall('btc_getblockcount', [])).result;

    const genResult = await rpcCall('btc_generatetoaddress', [
      5,
      'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
    ]);

    expect(genResult.result).toBeTruthy();
    expect(Array.isArray(genResult.result)).toBe(true);
    expect(genResult.result.length).toBe(5);

    const heightAfter = (await rpcCall('btc_getblockcount', [])).result;
    expect(heightAfter).toBe(heightBefore + 5);
  });

  it('should handle metashrew_height', async () => {
    const result = await rpcCall('metashrew_height', []);
    expect(result.result).toBeTruthy();
    // Height should match chain height (auto-indexed)
    const chainHeight = (await rpcCall('btc_getblockcount', [])).result;
    const indexerHeight = parseInt(result.result, 10);
    expect(indexerHeight).toBeLessThanOrEqual(chainHeight + 1);
  });

  it('should handle sandshrew_multicall', async () => {
    const result = await rpcCall('sandshrew_multicall', [
      ['btc_getblockcount', []],
      ['btc_getbestblockhash', []],
    ]);

    expect(result.result).toBeTruthy();
    expect(Array.isArray(result.result)).toBe(true);
    expect(result.result.length).toBe(2);

    // First sub-call: blockcount
    expect(result.result[0].result).toBeTypeOf('number');

    // Second sub-call: best block hash
    expect(result.result[1].result).toBeTruthy();
    expect(result.result[1].result.length).toBe(64);
  });

  it('should handle unknown methods gracefully', async () => {
    const result = await rpcCall('nonexistent_method', []);
    expect(result.error || result.result !== undefined).toBeTruthy();
  });
});
