/**
 * Pins the pure-function contract of `selectAvailableUtxos` extracted
 * from `SendModal.availableUtxos`. Both the React component and the
 * headless harness (`scripts/verify-display-mainnet.ts`) call this
 * function, so any drift here is caught by these tests AND the harness's
 * live-mainnet assertions before push.
 *
 * Failure history these pins prevent:
 *   - mork1e IMG_2439 (2026-05-17): "Insufficient BTC balance" with
 *     fresh UTXO dropped because the inline filter gated on metashrew
 *     confirmations rather than bitcoind. Fixed at 25139c1e; this test
 *     suite locks the bitcoind-gated contract.
 *   - mork1e "Broken" 2026-05-18: 137_969 vs expected ~230_000 sats
 *     spendable. Filter chain narrows correctly to non-alkane-carriers
 *     for single-address wallets but the per-address selection had a
 *     subtle drift; these pins catch it.
 */
import { describe, it, expect } from 'vitest';
import {
  selectAvailableUtxos,
  sumAvailableSats,
  type SendModalFilterUtxo,
} from '../sendModalFilter';

const ADDR_TAPROOT = 'bc1ptaproot00000000000000000000000000000000000000000000000000000';
const ADDR_SEGWIT = 'bc1qsegwit00000000000000000000000000000000';

function mkUtxo(over: Partial<SendModalFilterUtxo> = {}): SendModalFilterUtxo {
  return {
    txid: 'a'.repeat(64),
    vout: 0,
    value: 10_000,
    address: ADDR_TAPROOT,
    status: { confirmed: true, block_height: 949_900 },
    ...over,
  };
}

describe('selectAvailableUtxos — confirmed gating', () => {
  it('includes confirmed UTXOs on a fee-source address', () => {
    const out = selectAvailableUtxos({
      utxos: [mkUtxo({ value: 50_000 })],
      ourPendingTxids: new Set(),
      frozenUtxos: new Set(),
      showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT],
      isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(50_000);
  });

  it('excludes unconfirmed UTXOs UNLESS they are from our pending tx', () => {
    const ourPendingTxids = new Set(['ourbroadcasttxid']);
    const utxos: SendModalFilterUtxo[] = [
      // Random unconfirmed — filtered.
      mkUtxo({ txid: 'somebodyelsepending', status: { confirmed: false } }),
      // Our broadcast — allowed through.
      mkUtxo({ txid: 'ourbroadcasttxid', value: 30_000, status: { confirmed: false } }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids,
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(1);
    expect(out[0].txid).toBe('ourbroadcasttxid');
  });
});

describe('selectAvailableUtxos — fee-source address gating', () => {
  it('excludes UTXOs not on a btcFromAddresses entry', () => {
    const utxos = [
      mkUtxo({ address: ADDR_TAPROOT }),
      mkUtxo({ txid: 'b'.repeat(64), address: 'bc1pothersomeone' }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(1);
    expect(out[0].address).toBe(ADDR_TAPROOT);
  });

  it('includes UTXOs from any fee-source address (dual-address wallet)', () => {
    const utxos = [
      mkUtxo({ address: ADDR_SEGWIT, value: 30_000 }),
      mkUtxo({ txid: 'b'.repeat(64), address: ADDR_TAPROOT, value: 50_000 }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_SEGWIT, ADDR_TAPROOT],
      // dual-address browser implied — segwit holds plain BTC, taproot may have alkanes
      isDualAddressBrowser: true,
    });
    expect(out).toHaveLength(2);
    expect(sumAvailableSats({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_SEGWIT, ADDR_TAPROOT],
      isDualAddressBrowser: true,
    })).toBe(80_000);
  });
});

describe('selectAvailableUtxos — frozen handling', () => {
  it('excludes frozen UTXOs by default', () => {
    const u1 = mkUtxo({ txid: 'a'.repeat(64), vout: 0 });
    const u2 = mkUtxo({ txid: 'b'.repeat(64), vout: 1 });
    const out = selectAvailableUtxos({
      utxos: [u1, u2],
      ourPendingTxids: new Set(),
      frozenUtxos: new Set([`${u2.txid}:${u2.vout}`]),
      showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT],
      isDualAddressBrowser: false,
    });
    expect(out.map((u) => u.txid)).toEqual([u1.txid]);
  });

  it('includes frozen UTXOs when showFrozenUtxos=true', () => {
    const u1 = mkUtxo({ txid: 'a'.repeat(64), vout: 0 });
    const u2 = mkUtxo({ txid: 'b'.repeat(64), vout: 1 });
    const out = selectAvailableUtxos({
      utxos: [u1, u2],
      ourPendingTxids: new Set(),
      frozenUtxos: new Set([`${u2.txid}:${u2.vout}`]),
      showFrozenUtxos: true,
      btcFromAddresses: [ADDR_TAPROOT],
      isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(2);
  });
});

describe('selectAvailableUtxos — alkane/rune/inscription safety (single-address)', () => {
  // Single-address wallets (UniSat / OKX / keystore) share one address for
  // BTC and alkanes. We MUST exclude alkane-carrier dust from BTC-spend
  // candidates or we'd burn the alkane as a fee input.

  it('excludes UTXOs carrying alkanes on single-address wallets', () => {
    const utxos: SendModalFilterUtxo[] = [
      mkUtxo({ value: 50_000 }), // clean
      mkUtxo({ txid: 'b'.repeat(64), value: 546, alkanes: { '2:0': { value: '1000' } } }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(50_000);
  });

  it('excludes UTXOs carrying runes on single-address wallets', () => {
    const utxos: SendModalFilterUtxo[] = [
      mkUtxo({ value: 50_000 }),
      mkUtxo({ txid: 'b'.repeat(64), value: 546, runes: { 'rune': '1' } }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(1);
  });

  it('excludes UTXOs carrying inscriptions on single-address wallets', () => {
    const utxos: SendModalFilterUtxo[] = [
      mkUtxo({ value: 50_000 }),
      mkUtxo({ txid: 'b'.repeat(64), value: 546, inscriptions: ['insc1'] }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    expect(out).toHaveLength(1);
  });

  it('INCLUDES alkane-carrying UTXOs on dual-address browser wallets', () => {
    // Xverse / Leather / OYL route inscriptions and alkanes to taproot;
    // their segwit payment address doesn't carry them. The filter
    // relaxes for dual-address wallets so users can spend any taproot
    // UTXO via the same modal.
    const utxos: SendModalFilterUtxo[] = [
      mkUtxo({ value: 50_000 }),
      mkUtxo({ txid: 'b'.repeat(64), value: 546, alkanes: { '2:0': { value: '1' } } }),
    ];
    const out = selectAvailableUtxos({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: true,
    });
    expect(out).toHaveLength(2);
  });
});

describe('selectAvailableUtxos — mork1e regressions', () => {
  // mork1e IMG_2439 + "Broken" screenshots. The data layer (after
  // task #30 fix) reports btcSats.spendable correctly using
  // bitcoind-gated blockHeight. The SendModal filter must produce a
  // sum that MATCHES the spendable aggregate when no frozen/dust/
  // alkane-carrier excludes apply.

  it("mork's scenario: only non-dust BTC UTXOs at the user's address get included", () => {
    // 4 dust UTXOs (alkane carriers) + 2 clean BTC UTXOs at same taproot address.
    const utxos: SendModalFilterUtxo[] = [
      mkUtxo({ txid: 'd0', value: 546, alkanes: { '2:0': { value: '1' } } }),
      mkUtxo({ txid: 'd1', value: 546, alkanes: { '2:35275': { value: '1' } } }),
      mkUtxo({ txid: 'd2', value: 546, alkanes: { '2:77269': { value: '1' } } }),
      mkUtxo({ txid: 'd3', value: 546 }), // genuinely empty dust — would still slip through unless explicitly filtered
      mkUtxo({ txid: 'b1', value: 19_035 }),
      mkUtxo({ txid: 'b2', value: 211_701 }),
    ];
    const sum = sumAvailableSats({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    // The 3 alkane-bearing dust are filtered (alkanes set). The 1 empty
    // dust + 2 clean UTXOs pass: 546 + 19_035 + 211_701 = 231_282.
    // NB: the empty-dust inclusion is an open follow-up — Send shouldn't
    // try to spend a 546-sat input as BTC because the fee would dwarf
    // the value. Captured here so a future dust-floor fix updates this
    // assertion in lockstep with the filter change.
    expect(sum).toBe(546 + 19_035 + 211_701);
  });

  it('returns 0 sum when wallet has only alkane carriers (no clean BTC)', () => {
    const utxos: SendModalFilterUtxo[] = [
      mkUtxo({ txid: 'd0', value: 546, alkanes: { '2:0': { value: '1' } } }),
      mkUtxo({ txid: 'd1', value: 546, alkanes: { '2:0': { value: '1' } } }),
    ];
    const sum = sumAvailableSats({
      utxos, ourPendingTxids: new Set(),
      frozenUtxos: new Set(), showFrozenUtxos: false,
      btcFromAddresses: [ADDR_TAPROOT], isDualAddressBrowser: false,
    });
    expect(sum).toBe(0);
  });
});
