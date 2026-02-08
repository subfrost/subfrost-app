/**
 * Integration test: verify SDK methods used by pool/history hooks work on mainnet.
 *
 * NOTE: Tests marked with `.skip` fail with "No data in response" due to a Node.js
 * WASM compatibility issue — the RPC calls succeed (hex data is returned in logs) but
 * the WASM parser fails to process the response in the Node.js test environment.
 * These methods work correctly in the browser (verified via dev server proxy logs).
 *
 * Tests the actual SDK WebProvider methods that replaced direct fetch() calls:
 * - alkanesGetAllPoolsWithDetails (usePools, useAlkanesTokenPairs, useDynamicPools)
 * - alkanesGetAllPools (useAmmHistory)
 * - dataApiGetPoolHistory (useAmmHistory)
 * - alkanesReflect (usePools fetchUnknownTokenNames)
 * - ammGetPoolDetails (useAmmHistory usePoolsMetadata fallback)
 */
import { describe, it, expect, beforeAll } from 'vitest';

const MAINNET_FACTORY_ID = '4:65522';
const MAINNET_RPC_URL = 'https://mainnet.subfrost.io/v4/subfrost';

let provider: any;

beforeAll(async () => {
  const wasm = await import('@alkanes/ts-sdk/wasm');
  provider = new wasm.WebProvider('mainnet', {
    jsonrpc_url: MAINNET_RPC_URL,
    data_api_url: MAINNET_RPC_URL,
  });
  provider.walletCreate();
});

describe('SDK pool data methods (mainnet)', () => {
  it('alkanesGetAllPoolsWithDetails returns pools with details', async () => {
    const result = await provider.alkanesGetAllPoolsWithDetails(MAINNET_FACTORY_ID);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const pools = parsed?.pools || [];

    expect(pools.length).toBeGreaterThan(0);
    console.log(`[test] alkanesGetAllPoolsWithDetails: ${pools.length} pools`);

    // Verify first pool has the expected structure
    const first = pools[0];
    expect(first).toHaveProperty('pool_id_block');
    expect(first).toHaveProperty('pool_id_tx');
    expect(first).toHaveProperty('details');
    expect(first.details).toHaveProperty('token_a_block');
    expect(first.details).toHaveProperty('token_b_block');
    expect(first.details).toHaveProperty('reserve_a');
    expect(first.details).toHaveProperty('reserve_b');
    expect(first.details).toHaveProperty('pool_name');

    if (first.details.pool_name) {
      expect(first.details.pool_name).toMatch(/.+\s*\/\s*.+\s*LP/);
    }
  }, 60000);

  it('alkanesGetAllPools returns pool IDs', async () => {
    const result = await provider.alkanesGetAllPools(MAINNET_FACTORY_ID);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    const pools = parsed?.pools || parsed || [];
    expect(pools.length).toBeGreaterThan(0);
    console.log(`[test] alkanesGetAllPools: ${pools.length} pool IDs`);
    console.log(`[test] alkanesGetAllPools response shape:`, JSON.stringify(pools[0]).slice(0, 200));

    // Verify we can construct pool ID strings
    const first = pools[0];
    const poolId = first.pool_id || `${first.pool_id_block ?? first.block}:${first.pool_id_tx ?? first.tx}`;
    expect(poolId).toMatch(/\d+:\d+/);
    console.log(`[test] First pool ID: ${poolId}`);
  }, 30000);

  it('dataApiGetPoolHistory returns data for a pool', async () => {
    // First get a real pool ID from alkanesGetAllPoolsWithDetails
    const allPools = await provider.alkanesGetAllPoolsWithDetails(MAINNET_FACTORY_ID);
    const parsed = typeof allPools === 'string' ? JSON.parse(allPools) : allPools;
    const pools = parsed?.pools || [];
    expect(pools.length).toBeGreaterThan(0);

    const poolId = `${pools[0].pool_id_block}:${pools[0].pool_id_tx}`;
    console.log(`[test] Fetching history for pool ${poolId}`);

    const history = await provider.dataApiGetPoolHistory(poolId, null, BigInt(5), BigInt(0));
    const historyParsed = typeof history === 'string' ? JSON.parse(history) : history;
    console.log(`[test] dataApiGetPoolHistory keys:`, Object.keys(historyParsed || {}));
    console.log(`[test] dataApiGetPoolHistory:`, JSON.stringify(historyParsed).slice(0, 500));

    expect(historyParsed).toBeDefined();
  }, 30000);

  it('alkanesReflect returns token metadata for DIESEL (2:0)', async () => {
    const result = await provider.alkanesReflect('2:0');
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    // BigInt values break JSON.stringify — use custom serializer for logging
    const safeStringify = (obj: any) => JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
    console.log(`[test] alkanesReflect(2:0):`, safeStringify(parsed).slice(0, 300));
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('symbol');
    expect(parsed.name || parsed.symbol).toBeTruthy();
  }, 15000);

  it('ammGetPoolDetails returns details for a pool', async () => {
    const allPools = await provider.alkanesGetAllPoolsWithDetails(MAINNET_FACTORY_ID);
    const parsed = typeof allPools === 'string' ? JSON.parse(allPools) : allPools;
    const pools = parsed?.pools || [];
    expect(pools.length).toBeGreaterThan(0);

    const poolId = `${pools[0].pool_id_block}:${pools[0].pool_id_tx}`;
    console.log(`[test] ammGetPoolDetails for pool ${poolId}`);

    const details = await provider.ammGetPoolDetails(poolId);
    const detailsParsed = typeof details === 'string' ? JSON.parse(details) : details;

    console.log(`[test] ammGetPoolDetails:`, JSON.stringify(detailsParsed).slice(0, 500));
    expect(detailsParsed).toBeDefined();
  }, 15000);
});
