/**
 * Pins the conversion contract between `useWalletState`'s WalletState
 * shape and the legacy `WalletUtxoCache` shape that 9 mutation hooks
 * have always consumed via `useWalletUtxoCache`.
 *
 * Critical invariants:
 *   - `amount: string` (WalletState) → `amount: bigint` (CachedUtxo)
 *     — JSON-safe scaling round-trips correctly even for >2^53 DIESEL.
 *   - `byOutpoint` / `byAlkane` / `balances` indexes are recomputed
 *     in TS from the flat utxos list — they were never RPC-sourced.
 *   - empty state → fully-empty cache (no NaN heights, no broken Maps)
 *   - height comes from `metashrewHeight`, NOT bitcoindHeight (callers
 *     gate `filterMetashrewSafe` on this).
 */
import { describe, it, expect } from 'vitest';
import { walletStateToCache } from '../useWalletUtxoCache';
import type { WalletState } from '@/lib/walletState/fetchWalletState';

const ADDR = 'bc1ptarapdejnpvg3sq8muuvrt8eqya8nqr8muqcre52pxv69dndluwq6nwh3w';
const TXID1 = 'a'.repeat(64);
const TXID2 = 'b'.repeat(64);

function baseState(over: Partial<WalletState> = {}): WalletState {
  return {
    addresses: [ADDR],
    metashrewHeight: 950_000,
    bitcoindHeight: 950_000,
    tipHash: 'cafe',
    utxos: [],
    btcSats: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0, pendingIn: 0, pendingOut: 0 },
    alkanes: {},
    ...over,
  };
}

describe('walletStateToCache', () => {
  it('null input → empty cache (height 0)', () => {
    const cache = walletStateToCache(null);
    expect(cache.utxos).toEqual([]);
    expect(cache.height).toBe(0);
    expect(cache.byOutpoint.size).toBe(0);
    expect(cache.byAlkane.size).toBe(0);
    expect(cache.balances.size).toBe(0);
  });

  it('empty utxos → empty cache but keeps metashrew height', () => {
    const cache = walletStateToCache(baseState({ utxos: [] }));
    expect(cache.utxos).toEqual([]);
    expect(cache.height).toBe(950_000); // metashrew height preserved
  });

  it('converts amount string → bigint', () => {
    const cache = walletStateToCache(baseState({
      utxos: [{
        txid: TXID1, vout: 0, value: 546, address: ADDR,
        blockHeight: 949_990, confirmations: 11,
        alkanes: [{ block: 2, tx: 0, amount: '5000000' }],
      }],
    }));
    expect(cache.utxos[0].alkanes[0].amount).toBe(5_000_000n);
    expect(typeof cache.utxos[0].alkanes[0].amount).toBe('bigint');
  });

  it('preserves >2^53 amounts without precision loss (DIESEL-scale)', () => {
    const huge = '1000000000000000000'; // 10^18
    const cache = walletStateToCache(baseState({
      utxos: [{
        txid: TXID1, vout: 0, value: 546, address: ADDR,
        blockHeight: 949_990, confirmations: 11,
        alkanes: [{ block: 2, tx: 0, amount: huge }],
      }],
    }));
    expect(cache.utxos[0].alkanes[0].amount).toBe(1_000_000_000_000_000_000n);
    expect(cache.balances.get('2:0')).toBe(1_000_000_000_000_000_000n);
  });

  it('builds byOutpoint + byAlkane indexes from utxos', () => {
    const cache = walletStateToCache(baseState({
      utxos: [
        { txid: TXID1, vout: 0, value: 546, address: ADDR, blockHeight: 949_990, confirmations: 11, alkanes: [{ block: 2, tx: 0, amount: '5' }] },
        { txid: TXID2, vout: 0, value: 546, address: ADDR, blockHeight: 949_990, confirmations: 11, alkanes: [{ block: 2, tx: 0, amount: '3' }, { block: 2, tx: 5, amount: '99' }] },
        { txid: TXID2, vout: 1, value: 12_000, address: ADDR, blockHeight: 949_990, confirmations: 11, alkanes: [] },
      ],
    }));

    expect(cache.utxos).toHaveLength(3);
    expect(cache.byOutpoint.get(`${TXID2}:1`)?.value).toBe(12_000);
    expect(cache.byOutpoint.size).toBe(3);

    const diesel = cache.byAlkane.get('2:0') ?? [];
    expect(diesel).toHaveLength(2);
    // Aggregated DIESEL balance = 5 + 3 = 8
    expect(cache.balances.get('2:0')).toBe(8n);
    // Other alkane only on one outpoint
    expect(cache.byAlkane.get('2:5')).toHaveLength(1);
    expect(cache.balances.get('2:5')).toBe(99n);
  });

  it('non-dust BTC utxo emits empty alkanes array (signals "asserted clean" to SDK)', () => {
    const cache = walletStateToCache(baseState({
      utxos: [{
        txid: TXID1, vout: 0, value: 100_000, address: ADDR,
        blockHeight: 949_990, confirmations: 11, alkanes: [],
      }],
    }));
    expect(cache.utxos[0].alkanes).toEqual([]);
    // This empty array (NOT undefined) is what execute.ts forwards as
    // `prefetched_utxos[i].alkanes = []` → Rust `Some(vec![])` → "asserted
    // clean, do not RPC". A regression that drops the array → `undefined`
    // → Rust `None` → SDK falls back to per-outpoint RPC. DO NOT change
    // this without updating the corresponding execute.ts test.
  });

  it('cache height comes from metashrewHeight, not bitcoindHeight', () => {
    const cache = walletStateToCache(baseState({
      metashrewHeight: 950_000,
      bitcoindHeight: 950_005, // metashrew is 5 blocks behind bitcoind
    }));
    expect(cache.height).toBe(950_000);
    // Callers gate `filterMetashrewSafe` on this — using bitcoindHeight
    // would let mutation hooks select UTXOs metashrew hasn't indexed yet.
  });
});
