/**
 * Integration test: verify SDK/API methods used by usePools and useAmmHistory hooks.
 *
 * Tests the live mainnet endpoints to ensure our code paths will work:
 * - dataApiGetAllPoolsDetails (usePools primary path)
 * - alkanesGetAllPoolsWithDetails (usePools fallback path — known Node.js WASM issue)
 * - /get-all-amm-tx-history (useAmmHistory primary path)
 * - /get-all-address-amm-tx-history (useAmmHistory with address filter)
 * - alkanesReflect (usePools enrichTokenNames)
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

// ============================================================================
// usePools — primary path: dataApiGetAllPoolsDetails
// ============================================================================

describe('usePools data sources', () => {
  it('dataApiGetAllPoolsDetails returns pools with TVL/volume/APR', async () => {
    const result = await provider.dataApiGetAllPoolsDetails(MAINNET_FACTORY_ID);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    // SDK returns raw API response: { data: { pools: [...], ... } }
    const pools = parsed?.pools || parsed?.data?.pools || [];

    console.log(`[test] dataApiGetAllPoolsDetails: ${pools.length} pools`);
    console.log('[test] Top-level keys:', Object.keys(parsed || {}));
    if (parsed?.data) console.log('[test] data keys:', Object.keys(parsed.data));
    expect(pools.length).toBeGreaterThan(0);

    // Verify the shape matches what fetchPoolsFromDataApi expects
    const first = pools[0];
    console.log('[test] First pool keys:', Object.keys(first));
    console.log('[test] First pool sample:', JSON.stringify(first).slice(0, 600));

    // poolId must be { block, tx }
    expect(first).toHaveProperty('poolId');
    expect(first.poolId).toHaveProperty('block');
    expect(first.poolId).toHaveProperty('tx');

    // token0, token1 must be { block, tx }
    expect(first).toHaveProperty('token0');
    expect(first.token0).toHaveProperty('block');
    expect(first.token0).toHaveProperty('tx');
    expect(first).toHaveProperty('token1');
    expect(first.token1).toHaveProperty('block');
    expect(first.token1).toHaveProperty('tx');

    // Reserves
    expect(first).toHaveProperty('token0Amount');
    expect(first).toHaveProperty('token1Amount');

    // Pool name for symbol extraction
    expect(first).toHaveProperty('poolName');
    if (first.poolName) {
      console.log('[test] Pool name:', first.poolName);
    }

    // Pre-calculated TVL (the whole point of using this endpoint)
    expect(first).toHaveProperty('poolTvlInUsd');
    expect(typeof first.poolTvlInUsd).toBe('number');
    console.log('[test] Pool TVL:', first.poolTvlInUsd);

    // Check at least one pool in the set has non-zero TVL
    const anyWithTvl = pools.some((p: any) => (p.poolTvlInUsd ?? 0) > 0);
    expect(anyWithTvl).toBe(true);

    // Log volume/APR fields
    console.log('[test] Volume 1d:', first.poolVolume1dInUsd);
    console.log('[test] Volume 30d:', first.poolVolume30dInUsd);
    console.log('[test] APR:', first.poolApr);
  }, 60000);

  // NOTE: alkanesGetAllPoolsWithDetails fails with "No data in response" in Node.js
  // due to WASM compatibility issues. It works in the browser. Skipped in CI.
  it.skip('alkanesGetAllPoolsWithDetails (fallback) returns pools with details', async () => {
    const result = await provider.alkanesGetAllPoolsWithDetails(MAINNET_FACTORY_ID);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const pools = parsed?.pools || [];

    expect(pools.length).toBeGreaterThan(0);

    const first = pools[0];
    expect(first).toHaveProperty('pool_id_block');
    expect(first).toHaveProperty('pool_id_tx');
    expect(first).toHaveProperty('details');
    expect(first.details).toHaveProperty('token_a_block');
    expect(first.details).toHaveProperty('reserve_a');
  }, 60000);

  it('alkanesReflect returns token metadata for DIESEL (2:0)', async () => {
    const result = await provider.alkanesReflect('2:0');
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    const safeStringify = (obj: any) => JSON.stringify(obj, (_k, v) => typeof v === 'bigint' ? v.toString() : v);
    console.log(`[test] alkanesReflect(2:0):`, safeStringify(parsed).slice(0, 300));
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('symbol');
    expect(parsed.name || parsed.symbol).toBeTruthy();
  }, 15000);
});

// ============================================================================
// useAmmHistory — primary path: /get-all-amm-tx-history via REST
// ============================================================================

describe('useAmmHistory data sources', () => {
  it('/get-all-amm-tx-history returns transactions', async () => {
    const res = await fetch(`${MAINNET_RPC_URL}/get-all-amm-tx-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 10, offset: 0 }),
    });

    expect(res.ok).toBe(true);
    const json = await res.json();
    console.log('[test] /get-all-amm-tx-history top keys:', Object.keys(json));

    // API returns { data: { items, total, count, offset } }
    const payload = json?.data ?? json;
    console.log('[test] payload keys:', Object.keys(payload || {}));
    console.log('[test] payload sample:', JSON.stringify(payload).slice(0, 800));

    const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    expect(items.length).toBeGreaterThan(0);
    console.log(`[test] /get-all-amm-tx-history: ${items.length} items, total: ${payload?.total}`);

    // Verify first item has required fields
    const first = items[0];
    console.log('[test] First tx keys:', Object.keys(first));
    console.log('[test] First tx:', JSON.stringify(first).slice(0, 400));
    expect(first).toHaveProperty('type');
    expect(['swap', 'mint', 'burn', 'creation']).toContain(first.type);
    expect(first).toHaveProperty('transactionId');
    expect(first).toHaveProperty('timestamp');

    // Swap-specific fields
    if (first.type === 'swap') {
      expect(first).toHaveProperty('soldAmount');
      expect(first).toHaveProperty('boughtAmount');
      expect(first).toHaveProperty('soldTokenBlockId');
      expect(first).toHaveProperty('soldTokenTxId');
      expect(first).toHaveProperty('boughtTokenBlockId');
      expect(first).toHaveProperty('boughtTokenTxId');
    }

    // Mint/burn/creation fields
    if (first.type === 'mint' || first.type === 'burn' || first.type === 'creation') {
      expect(first).toHaveProperty('token0Amount');
      expect(first).toHaveProperty('token1Amount');
      expect(first).toHaveProperty('poolBlockId');
      expect(first).toHaveProperty('poolTxId');
    }
  }, 30000);

  it('/get-all-amm-tx-history supports category filter', async () => {
    const res = await fetch(`${MAINNET_RPC_URL}/get-all-amm-tx-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 5, offset: 0, category: 'swap' }),
    });

    expect(res.ok).toBe(true);
    const json = await res.json();
    const payload = json?.data ?? json;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    console.log(`[test] /get-all-amm-tx-history (swap only): ${items.length} items`);

    // All returned items should be swaps
    for (const item of items) {
      expect(item.type).toBe('swap');
    }
  }, 30000);

  it('/get-all-address-amm-tx-history returns address-filtered txs', async () => {
    // First get an address from the general history
    const allRes = await fetch(`${MAINNET_RPC_URL}/get-all-amm-tx-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 5, offset: 0 }),
    });
    const allJson = await allRes.json();
    const allPayload = allJson?.data ?? allJson;
    const allItems = Array.isArray(allPayload?.items) ? allPayload.items : [];
    expect(allItems.length).toBeGreaterThan(0);

    const testAddress = allItems[0].address;
    console.log(`[test] Testing address filter with: ${testAddress}`);

    if (!testAddress) {
      console.log('[test] No address on first tx, skipping address filter test');
      return;
    }

    const res = await fetch(`${MAINNET_RPC_URL}/get-all-address-amm-tx-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: testAddress, count: 5, offset: 0 }),
    });

    expect(res.ok).toBe(true);
    const json = await res.json();
    const payload = json?.data ?? json;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    console.log(`[test] /get-all-address-amm-tx-history: ${items.length} items for ${testAddress}`);

    // All returned items should belong to the address
    for (const item of items) {
      if (item.address) {
        expect(item.address.toLowerCase()).toBe(testAddress.toLowerCase());
      }
    }
  }, 30000);

  it('ammGetPoolDetails returns details for enrichment', async () => {
    // Get a pool ID from the history
    const res = await fetch(`${MAINNET_RPC_URL}/get-all-amm-tx-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 20, offset: 0 }),
    });
    const json = await res.json();
    const payload = json?.data ?? json;
    const items = Array.isArray(payload?.items) ? payload.items : [];

    const itemWithPool = items.find((i: any) => i.poolBlockId && i.poolTxId);
    if (!itemWithPool) {
      console.log('[test] No items with poolBlockId/poolTxId found, skipping');
      return;
    }

    const poolId = `${itemWithPool.poolBlockId}:${itemWithPool.poolTxId}`;
    console.log(`[test] ammGetPoolDetails for pool ${poolId}`);

    const details = await provider.ammGetPoolDetails(poolId);
    // ammGetPoolDetails may return a hex-encoded revert string for pools
    // where opcode 999 is unavailable. The hook handles this with try/catch.
    let detailsParsed: any;
    try {
      detailsParsed = typeof details === 'string' ? JSON.parse(details) : details;
    } catch {
      console.log('[test] ammGetPoolDetails returned non-JSON (expected for some pools):', String(details).slice(0, 200));
      // This is acceptable — the hook's try/catch handles it gracefully
      return;
    }

    console.log('[test] ammGetPoolDetails:', JSON.stringify(detailsParsed).slice(0, 500));
    expect(detailsParsed).toBeDefined();
    // Used by usePoolsMetadata to enrich mint/burn/creation txs
    expect(detailsParsed).toHaveProperty('token_a_block');
    expect(detailsParsed).toHaveProperty('token_a_tx');
    expect(detailsParsed).toHaveProperty('token_b_block');
    expect(detailsParsed).toHaveProperty('token_b_tx');
  }, 30000);
});
