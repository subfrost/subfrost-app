/**
 * Test: REST endpoint routing through devnet fetch interceptor → quspo.
 *
 * Verifies that the SDK's data API REST calls (e.g., /get-all-pools-details)
 * are correctly intercepted and routed to quspo tertiary indexer views,
 * then transformed into the REST response format the SDK expects.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDevnetTestContext,
  disposeHarness,
  mineBlocks,
} from './devnet-helpers';
import { deployAmmContracts } from './amm-deploy';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;
try { bitcoin.initEccLib(ecc); } catch {}

let harness: any;
let provider: WebProvider;
let taprootAddress: string;
let segwitAddress: string;
let factoryId: string;

beforeAll(async () => {
  disposeHarness();
  const ctx = await createDevnetTestContext();
  harness = ctx.harness;
  provider = ctx.provider;
  taprootAddress = ctx.taprootAddress;
  segwitAddress = ctx.segwitAddress;

  // Mine 401 blocks for coinbase maturity (funds the wallet)
  mineBlocks(harness, 401);

  // Deploy AMM factory + pool so we have real data to query
  const amm = await deployAmmContracts(provider, ctx.signer, segwitAddress, taprootAddress, harness);
  factoryId = amm.factoryId;
  console.log('[rest-routing] AMM deployed, factory:', factoryId);
}, 120_000);

afterAll(() => {
  disposeHarness();
});

describe('Devnet REST → Quspo Routing', () => {
  describe('Pool endpoints', () => {
    it('/get-all-pools-details returns pools via quspo', async () => {
      const [block, tx] = factoryId.split(':');
      const resp = await fetch('http://localhost:18888/get-all-pools-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryId: { block, tx } }),
      });
      const data = await resp.json();
      console.log('[rest-routing] get-all-pools-details:', JSON.stringify(data).slice(0, 500));

      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
      // Pool count depends on whether deployAmmContracts creates a pool
      console.log('[rest-routing] Pool count:', data.data.length);

      if (data.data.length > 0) {
        const pool = data.data[0];
        expect(pool.poolId).toBeDefined();
        expect(pool.poolId.block).toBeDefined();
        expect(pool.poolId.tx).toBeDefined();
        expect(pool.token0).toBeDefined();
        expect(pool.token1).toBeDefined();
        expect(pool.reserve0).toBeDefined();
        expect(pool.reserve1).toBeDefined();
      }
    });

    it('/get-all-token-pairs returns same data', async () => {
      const [block, tx] = factoryId.split(':');
      const resp = await fetch('http://localhost:18888/get-all-token-pairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factoryId: { block, tx } }),
      });
      const data = await resp.json();
      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Balance endpoints', () => {
    it('/get-alkanes-by-address returns enriched balances', async () => {
      const resp = await fetch('http://localhost:18888/get-alkanes-by-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: taprootAddress }),
      });
      const data = await resp.json();
      console.log('[rest-routing] get-alkanes-by-address:', JSON.stringify(data).slice(0, 500));

      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);

      const entry = data.data[0];
      expect(entry.alkaneId).toBeDefined();
      expect(entry.alkaneId.block).toBeDefined();
      expect(entry.alkaneId.tx).toBeDefined();
      expect(entry.balance).toBeDefined();
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.symbol).toBe('string');
    });
  });

  describe('Activity endpoints', () => {
    it('/get-all-amm-tx-history returns activity', async () => {
      const resp = await fetch('http://localhost:18888/get-all-amm-tx-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await resp.json();
      console.log('[rest-routing] get-all-amm-tx-history:', JSON.stringify(data).slice(0, 500));

      expect(data.statusCode).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
      // Should have activity from pool creation
      expect(data.data.length).toBeGreaterThan(0);
    });
  });

  describe('Token metadata endpoints', () => {
    it('/get-alkane-details returns DIESEL details', async () => {
      const resp = await fetch('http://localhost:18888/get-alkane-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alkaneId: { block: '2', tx: '0' } }),
      });
      const data = await resp.json();
      console.log('[rest-routing] get-alkane-details:', JSON.stringify(data));

      expect(data.statusCode).toBe(200);
      expect(data.data).toBeDefined();
      expect(data.data.block).toBe('2');
      expect(data.data.tx).toBe('0');
    });
  });

  describe('Price endpoints', () => {
    it('/get-bitcoin-price returns mock 100k', async () => {
      const resp = await fetch('http://localhost:18888/get-bitcoin-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await resp.json();
      console.log('[rest-routing] get-bitcoin-price:', JSON.stringify(data));

      expect(data.usd).toBe(100000);
    });
  });

  describe('Wrap/unwrap endpoints', () => {
    it('/get-wrap-events-all returns events', async () => {
      const resp = await fetch('http://localhost:18888/get-wrap-events-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await resp.json();
      console.log('[rest-routing] get-wrap-events-all:', JSON.stringify(data).slice(0, 300));

      expect(data.statusCode).toBe(200);
    });
  });

  describe('SDK data API integration', () => {
    it('provider.dataApiGetAllPoolsDetails works through interceptor', async () => {
      const result = await provider.dataApiGetAllPoolsDetails(factoryId);
      console.log('[rest-routing] SDK dataApiGetAllPoolsDetails:', JSON.stringify(result).slice(0, 500));

      expect(result).toBeDefined();
    });

    it('provider.dataApiGetAlkanesByAddress works through interceptor', async () => {
      const result = await provider.dataApiGetAlkanesByAddress(taprootAddress);
      console.log('[rest-routing] SDK dataApiGetAlkanesByAddress:', JSON.stringify(result).slice(0, 500));

      expect(result).toBeDefined();
    });

    it('provider.dataApiGetBitcoinPrice works through interceptor', async () => {
      const result = await provider.dataApiGetBitcoinPrice();
      console.log('[rest-routing] SDK dataApiGetBitcoinPrice:', JSON.stringify(result));

      expect(result).toBeDefined();
    });
  });
});
