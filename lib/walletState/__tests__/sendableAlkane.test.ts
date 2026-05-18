/**
 * Pins the contract every USER-FACING INPUT (send modal, swap input, liquidity
 * input) MUST honour for showing alkane balance. Mork1e (2026-05-18, FB6) tested
 * the swap input and reported it was showing TOTAL instead of AVAILABLE, letting
 * him try to spend amounts already locked in mempool — which then failed at
 * broadcast.
 *
 * His verbatim spec is the source for the scenarios below:
 *   "if i had 10k tortilla across 5 utxos / and i was spending a utxo that
 *    had 700 tortilla / available should be 9300 tortilla / and mempool
 *    should be 700 tortilla / and total should be 10k tortilla"
 *
 * Any drift in this contract is caught both here AND in the headless harness
 * (scripts/verify-display-mainnet.ts I7) before a push reaches develop.
 */
import { describe, it, expect } from 'vitest';
import { getSendableAlkane } from '../sendableAlkane';

describe('getSendableAlkane — mork1e 2026-05-18 spec', () => {
  it('10k TORTILLA, pending swap consumes 700 → available=9300 mempool=700 total=10000', () => {
    const out = getSendableAlkane('10000', { delta: -700n });
    expect(out.totalRaw).toBe(10000n);
    expect(out.availableRaw).toBe(9300n);
    expect(out.mempoolRaw).toBe(700n);
    expect(out.canSendAny).toBe(true);
  });

  it('full lockup (700 confirmed, all in pending) → available=0 mempool=700 total=700', () => {
    // mork: "they dont show up because they are being spent in a utxo that is
    //        spending them all. the correct functionality here would be to
    //        show the assets but to set the 'mempool'"
    // The alkane MUST still be visible (totalRaw > 0) but uninspectable for
    // sends (canSendAny=false).
    const out = getSendableAlkane('700', { delta: -700n });
    expect(out.totalRaw).toBe(700n);
    expect(out.availableRaw).toBe(0n);
    expect(out.mempoolRaw).toBe(700n);
    expect(out.canSendAny).toBe(false);
  });

  it('no pending tx → available=total mempool=0', () => {
    const out = getSendableAlkane('4500000000', undefined);
    expect(out.totalRaw).toBe(4500000000n);
    expect(out.availableRaw).toBe(4500000000n);
    expect(out.mempoolRaw).toBe(0n);
    expect(out.canSendAny).toBe(true);
  });

  it('incoming pending (buy/wrap) → available=confirmed mempool=delta', () => {
    // Buying TORTILLA from a swap: confirmed unchanged, mempool surfaces
    // the to-arrive amount as a separate row but does NOT reduce available.
    const out = getSendableAlkane('1000', { delta: 500n });
    expect(out.totalRaw).toBe(1000n);
    expect(out.availableRaw).toBe(1000n);
    expect(out.mempoolRaw).toBe(500n);
  });
});

describe('getSendableAlkane — input shape tolerance', () => {
  it('accepts bigint input', () => {
    const out = getSendableAlkane(10000n, { delta: -700n });
    expect(out.availableRaw).toBe(9300n);
  });

  it('accepts string input', () => {
    const out = getSendableAlkane('10000', { delta: -700n });
    expect(out.availableRaw).toBe(9300n);
  });

  it('null/undefined confirmedRaw → all zeros', () => {
    expect(getSendableAlkane(null, undefined)).toEqual({
      totalRaw: 0n, availableRaw: 0n, mempoolRaw: 0n, canSendAny: false,
    });
    expect(getSendableAlkane(undefined, undefined)).toEqual({
      totalRaw: 0n, availableRaw: 0n, mempoolRaw: 0n, canSendAny: false,
    });
  });

  it('malformed confirmedRaw string → safe 0n', () => {
    const out = getSendableAlkane('not a number', { delta: -100n });
    expect(out.totalRaw).toBe(0n);
    expect(out.availableRaw).toBe(0n);
    expect(out.mempoolRaw).toBe(100n);
  });
});
