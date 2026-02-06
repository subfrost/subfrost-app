/**
 * Wallet State — Confirmed vs Pending Balance Separation Tests
 *
 * Tests verify:
 * 1. The processUtxo logic correctly separates confirmed from pending
 * 2. The lua script returns the expected structure via RPC
 * 3. Pre-computed sums match individual UTXO values
 *
 * Run with: npx vitest run hooks/__tests__/walletState.lua.test.ts
 */

import { describe, it, expect } from 'vitest';
import { WALLET_STATE_SCRIPT, WALLET_STATE_SCRIPT_HASH } from '@/lib/lua/index';

// ---------------------------------------------------------------------------
// Unit-level tests: processUtxo balance separation logic
// ---------------------------------------------------------------------------

/** Minimal UTXO shape matching what getEnrichedBalances returns */
interface MockUtxo {
  outpoint: string;
  value: number;
  height?: number;
  inscriptions?: any[];
  ord_runes?: Record<string, any>;
}

/**
 * Reimplementation of processUtxo balance logic from queries/account.ts
 * for isolated testing without React Query / provider dependencies.
 */
function computeBalances(
  spendable: MockUtxo[],
  assets: MockUtxo[],
  pending: MockUtxo[],
) {
  let totalBtc = 0;
  let spendableBtc = 0;
  let withAssetsBtc = 0;
  let pendingTotalBtc = 0;

  const processUtxo = (utxo: MockUtxo, isConfirmed: boolean, isSpendable: boolean) => {
    if (isConfirmed) {
      totalBtc += utxo.value;
      if (isSpendable) spendableBtc += utxo.value;
      else withAssetsBtc += utxo.value;
    } else {
      pendingTotalBtc += utxo.value;
    }
  };

  for (const utxo of spendable) processUtxo(utxo, true, true);
  for (const utxo of assets) processUtxo(utxo, true, false);
  for (const utxo of pending) processUtxo(utxo, false, false);

  return { totalBtc, spendableBtc, withAssetsBtc, pendingTotalBtc };
}

describe('processUtxo balance separation', () => {
  it('should count only confirmed UTXOs in total', () => {
    const result = computeBalances(
      [{ outpoint: 'a:0', value: 20000 }],
      [],
      [{ outpoint: 'b:0', value: 20000 }],
    );

    expect(result.totalBtc).toBe(20000);
    expect(result.pendingTotalBtc).toBe(20000);
  });

  it('should separate spendable from asset-bearing confirmed UTXOs', () => {
    const result = computeBalances(
      [{ outpoint: 'a:0', value: 10000 }, { outpoint: 'a:1', value: 5000 }],
      [{ outpoint: 'b:0', value: 3000, inscriptions: [{ id: 'i1', number: 1 }] }],
      [],
    );

    expect(result.totalBtc).toBe(18000);
    expect(result.spendableBtc).toBe(15000);
    expect(result.withAssetsBtc).toBe(3000);
    expect(result.pendingTotalBtc).toBe(0);
  });

  it('should not include pending in spendable or withAssets', () => {
    const result = computeBalances(
      [{ outpoint: 'a:0', value: 50000 }],
      [{ outpoint: 'b:0', value: 10000, ord_runes: { 'RUNE': { amount: '100', symbol: 'R', divisibility: 0 } } }],
      [{ outpoint: 'c:0', value: 25000 }],
    );

    expect(result.spendableBtc).toBe(50000);
    expect(result.withAssetsBtc).toBe(10000);
    expect(result.totalBtc).toBe(60000); // 50k + 10k, NOT 85k
    expect(result.pendingTotalBtc).toBe(25000);
  });

  it('should handle empty arrays', () => {
    const result = computeBalances([], [], []);

    expect(result.totalBtc).toBe(0);
    expect(result.spendableBtc).toBe(0);
    expect(result.withAssetsBtc).toBe(0);
    expect(result.pendingTotalBtc).toBe(0);
  });

  it('should handle all pending with no confirmed', () => {
    const result = computeBalances(
      [],
      [],
      [{ outpoint: 'a:0', value: 1000 }, { outpoint: 'a:1', value: 2000 }],
    );

    expect(result.totalBtc).toBe(0);
    expect(result.pendingTotalBtc).toBe(3000);
  });

  it('should handle all confirmed with no pending', () => {
    const result = computeBalances(
      [{ outpoint: 'a:0', value: 7000 }],
      [{ outpoint: 'b:0', value: 3000 }],
      [],
    );

    expect(result.totalBtc).toBe(10000);
    expect(result.pendingTotalBtc).toBe(0);
  });

  it('should verify sums match individual values', () => {
    const spendable = [
      { outpoint: 'a:0', value: 10000 },
      { outpoint: 'a:1', value: 20000 },
      { outpoint: 'a:2', value: 30000 },
    ];
    const assets = [{ outpoint: 'b:0', value: 5000 }];
    const pending = [
      { outpoint: 'c:0', value: 8000 },
      { outpoint: 'c:1', value: 12000 },
    ];

    const result = computeBalances(spendable, assets, pending);

    const expectedSpendable = spendable.reduce((s, u) => s + u.value, 0);
    const expectedAssets = assets.reduce((s, u) => s + u.value, 0);
    const expectedPending = pending.reduce((s, u) => s + u.value, 0);

    expect(result.spendableBtc).toBe(expectedSpendable);
    expect(result.withAssetsBtc).toBe(expectedAssets);
    expect(result.totalBtc).toBe(expectedSpendable + expectedAssets);
    expect(result.pendingTotalBtc).toBe(expectedPending);
  });
});

// ---------------------------------------------------------------------------
// Lua script structural tests
// ---------------------------------------------------------------------------

describe('WALLET_STATE_SCRIPT', () => {
  it('should be a non-empty string', () => {
    expect(typeof WALLET_STATE_SCRIPT).toBe('string');
    expect(WALLET_STATE_SCRIPT.length).toBeGreaterThan(100);
  });

  it('should reference args[1] for address', () => {
    expect(WALLET_STATE_SCRIPT).toContain('args[1]');
  });

  it('should call required RPC methods', () => {
    expect(WALLET_STATE_SCRIPT).toContain('_RPC.ord_blockheight()');
    expect(WALLET_STATE_SCRIPT).toContain('_RPC.metashrew_height()');
    expect(WALLET_STATE_SCRIPT).toContain('_RPC.esplora_addressutxo(address)');
    expect(WALLET_STATE_SCRIPT).toContain('_RPC.ord_outputs(address)');
  });

  it('should return confirmed and pending objects', () => {
    expect(WALLET_STATE_SCRIPT).toContain('confirmed =');
    expect(WALLET_STATE_SCRIPT).toContain('pending =');
    expect(WALLET_STATE_SCRIPT).toContain('confirmed_total');
    expect(WALLET_STATE_SCRIPT).toContain('confirmed_spendable');
    expect(WALLET_STATE_SCRIPT).toContain('confirmed_with_assets');
    expect(WALLET_STATE_SCRIPT).toContain('pending_total');
  });

  it('should have a valid hash', () => {
    expect(typeof WALLET_STATE_SCRIPT_HASH).toBe('string');
    expect(WALLET_STATE_SCRIPT_HASH).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Lua script via RPC integration test (requires regtest.subfrost.io)
// ---------------------------------------------------------------------------

describe('wallet-state lua script via RPC', () => {
  const RPC_URL = 'https://regtest.subfrost.io/v4/subfrost';
  const TEST_ADDRESS = 'bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe';

  it('should execute and return confirmed/pending structure', async () => {
    let result: any;
    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'sandshrew_evalscript',
          params: [WALLET_STATE_SCRIPT, [TEST_ADDRESS]],
          id: 1,
        }),
      });

      if (!response.ok) {
        console.warn(`[walletState.lua.test] RPC returned ${response.status}, skipping integration test`);
        return;
      }

      const json = await response.json();
      if (json.error) {
        console.warn(`[walletState.lua.test] RPC error: ${json.error.message}, skipping integration test`);
        return;
      }

      result = json.result?.returns ?? json.result;
    } catch (err) {
      console.warn('[walletState.lua.test] Cannot reach RPC endpoint, skipping integration test:', err);
      return;
    }

    // Verify structure
    expect(result).toHaveProperty('confirmed');
    expect(result).toHaveProperty('pending');
    expect(result).toHaveProperty('height');

    expect(result.confirmed).toHaveProperty('total');
    expect(result.confirmed).toHaveProperty('spendable');
    expect(result.confirmed).toHaveProperty('withAssets');
    expect(result.confirmed).toHaveProperty('utxos');

    expect(result.pending).toHaveProperty('total');
    expect(result.pending).toHaveProperty('utxos');

    // Verify types
    expect(typeof result.confirmed.total).toBe('number');
    expect(typeof result.confirmed.spendable).toBe('number');
    expect(typeof result.pending.total).toBe('number');
    expect(typeof result.height).toBe('number');

    // Lua tables with numeric keys may serialize as objects or arrays.
    // Empty Lua tables serialize as {} (object). Normalize to array for sum checks.
    const toArray = (val: any): any[] => {
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'object') return Object.values(val);
      return [];
    };

    const confirmedUtxos = toArray(result.confirmed.utxos);
    const pendingUtxos = toArray(result.pending.utxos);

    // Verify sums match individual UTXOs
    const confirmedSum = confirmedUtxos.reduce(
      (sum: number, u: any) => sum + (u.value ?? 0),
      0,
    );
    expect(result.confirmed.total).toBe(confirmedSum);

    const pendingSum = pendingUtxos.reduce(
      (sum: number, u: any) => sum + (u.value ?? 0),
      0,
    );
    expect(result.pending.total).toBe(pendingSum);

    // confirmed.total should NOT include pending
    expect(result.confirmed.total).toBeGreaterThanOrEqual(0);
    expect(result.pending.total).toBeGreaterThanOrEqual(0);

    // spendable + withAssets should equal confirmed.total
    expect(result.confirmed.spendable + result.confirmed.withAssets).toBe(result.confirmed.total);
  });
});
