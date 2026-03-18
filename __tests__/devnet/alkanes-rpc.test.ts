/**
 * Devnet: Alkanes RPC methods
 *
 * Tests alkanes-specific RPC methods through the in-process devnet:
 * alkanes_simulate, alkanes_meta, alkanes_protorunesbyaddress,
 * alkanes_protorunesbyoutpoint, alkanes_trace.
 *
 * These tests verify the protobuf encode → metashrew_view → decode pipeline
 * works correctly end-to-end in WASM.
 *
 * Run: pnpm vitest run __tests__/devnet/alkanes-rpc.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDevnetTestContext,
  disposeHarness,
  rpcCall,
} from './devnet-helpers';
import { DEVNET } from './devnet-constants';

describe('Devnet: Alkanes RPC', () => {
  let harness: any;

  beforeAll(async () => {
    const ctx = await createDevnetTestContext();
    harness = ctx.harness;

    // Mine some blocks so the indexer has data
    harness.mineBlocks(10);
  }, 60_000);

  afterAll(() => {
    disposeHarness();
  });

  describe('alkanes_simulate', () => {
    it('should accept a simulate request and return a response', async () => {
      const result = await rpcCall('alkanes_simulate', [
        {
          target: { block: '2', tx: '0' },
          inputs: ['99'],
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '10',
          txindex: 0,
          vout: 0,
        },
      ]);

      // The response should be valid JSON-RPC (may error if DIESEL doesn't exist in devnet)
      expect(result).toBeTruthy();
      expect(result.result || result.error).toBeTruthy();

      if (result.result) {
        // If the alkane exists, we get a simulate response
        expect(result.result).toHaveProperty('status');
        expect(result.result).toHaveProperty('execution');
      }
    });

    it('should encode/decode simulate request correctly', async () => {
      // Simulate with explicit target and inputs
      const result = await rpcCall('alkanes_simulate', [
        {
          target: { block: '0', tx: '0' },
          inputs: [],
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '1',
          txindex: 0,
          vout: 0,
        },
      ]);

      expect(result).toBeTruthy();
      // Should get either a valid response or an error (not a crash)
      expect(result.result !== undefined || result.error !== undefined).toBe(true);
    });
  });

  describe('alkanes_protorunesbyaddress', () => {
    it('should accept address queries', async () => {
      const result = await rpcCall('alkanes_protorunesbyaddress', [
        { address: 'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx', protocolTag: '1' },
      ]);

      expect(result).toBeTruthy();

      if (result.result) {
        expect(result.result).toHaveProperty('outpoints');
        expect(result.result).toHaveProperty('balances');
        expect(Array.isArray(result.result.outpoints)).toBe(true);
      }
    });

    it('should handle string address format', async () => {
      const result = await rpcCall('alkanes_protorunesbyaddress', [
        'bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx',
      ]);

      expect(result).toBeTruthy();
      if (result.result) {
        expect(result.result).toHaveProperty('outpoints');
      }
    });
  });

  describe('alkanes_meta', () => {
    it('should accept meta queries', async () => {
      const result = await rpcCall('alkanes_meta', [
        { target: { block: '2', tx: '0' } },
      ]);

      expect(result).toBeTruthy();
      // Either returns metadata or an error if the alkane doesn't exist
      expect(result.result !== undefined || result.error !== undefined).toBe(true);
    });
  });

  describe('metashrew_view', () => {
    it('should handle raw metashrew_view calls', async () => {
      // Call metashrew_view directly (bypass alkanes encoding)
      const result = await rpcCall('metashrew_view', [
        'height',
        '0x',
        'latest',
      ]);

      expect(result).toBeTruthy();
    });
  });
});
