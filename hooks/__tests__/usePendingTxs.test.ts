/**
 * Pure-function unit tests for `usePendingTxs.ts`'s `computeBtcDelta`.
 *
 * The hook itself needs jsdom + IndexedDB; the React surface is
 * exercised in camoufoxd e2e (Phase 1 final). This file pins the
 * signed-arithmetic semantics that drive the optimistic BTC overlay.
 */

import { describe, it, expect } from 'vitest';
import { computeBtcDelta } from '@/hooks/usePendingTxs';

const USER_ADDR = 'bc1p026hg4dfhchc0axnmlpamu4v9gltcqtrzk0nvyc00n4eu5nl5tpsrh7zkm';
const RECIPIENT = 'bc1puvfmy5whzdq35nd2trckkm09em9u7ps6lal564jz92c9feswwrpsr7ach5';
const PREV_TXID = '601a0f80119a49351bdf8088423813d9d1f68b1326d81e2b2daba5f57764b1c0';

describe('computeBtcDelta', () => {
  const ourAddresses = new Set([USER_ADDR]);

  it('outgoing-only tx produces a negative delta', () => {
    // We spend a 10000-sat UTXO and pay 8000 to a recipient.
    const tx = {
      txid: 'foo',
      vin: [{ txid: PREV_TXID, vout: 0 }],
      vout: [{ addressMatchesUs: false, value: 8000 }],
    };
    const lookup = (txid: string, vout: number) => {
      if (txid === PREV_TXID && vout === 0) return { address: USER_ADDR, value: 10000 };
      return null;
    };
    expect(computeBtcDelta(tx, lookup, ourAddresses)).toBe(-10000n);
  });

  it('outgoing tx with self-change produces net negative (fee + recipient)', () => {
    // 10000-sat input → 8000 to recipient + 1900 self-change. Fee = 100.
    const tx = {
      txid: 'foo',
      vin: [{ txid: PREV_TXID, vout: 0 }],
      vout: [
        { addressMatchesUs: false, value: 8000 },
        { addressMatchesUs: true, value: 1900 },
      ],
    };
    const lookup = (txid: string, vout: number) => {
      if (txid === PREV_TXID && vout === 0) return { address: USER_ADDR, value: 10000 };
      return null;
    };
    // -10000 (input) + 1900 (self change) = -8100 net.
    expect(computeBtcDelta(tx, lookup, ourAddresses)).toBe(-8100n);
  });

  it('incoming tx produces a positive delta', () => {
    // Tx pays us 5000 sats. Inputs are NOT ours — lookup returns null,
    // so they don't subtract.
    const tx = {
      txid: 'foo',
      vin: [{ txid: PREV_TXID, vout: 0 }],
      vout: [{ addressMatchesUs: true, value: 5000 }],
    };
    const lookup = () => null; // not our prevout
    expect(computeBtcDelta(tx, lookup, ourAddresses)).toBe(5000n);
  });

  it('mixed-input tx (some ours, some not) only subtracts our contribution', () => {
    // 5000 ours + 3000 someone else's → 7800 to recipient (200 fee).
    const tx = {
      txid: 'foo',
      vin: [
        { txid: PREV_TXID, vout: 0 },
        { txid: 'aa'.repeat(32), vout: 1 },
      ],
      vout: [{ addressMatchesUs: false, value: 7800 }],
    };
    const lookup = (txid: string, vout: number) => {
      if (txid === PREV_TXID && vout === 0) return { address: USER_ADDR, value: 5000 };
      if (txid === 'aa'.repeat(32) && vout === 1) return { address: RECIPIENT, value: 3000 };
      return null;
    };
    // We lose 5000, gain 0 → -5000. The other input is theirs.
    expect(computeBtcDelta(tx, lookup, ourAddresses)).toBe(-5000n);
  });

  it('zero-output protostone OP_RETURN doesn\'t affect delta', () => {
    // Real-world atomic flow: 1 self-input, 1 self-output, 1 OP_RETURN.
    const tx = {
      txid: 'foo',
      vin: [{ txid: PREV_TXID, vout: 0 }],
      vout: [
        { addressMatchesUs: true, value: 9800 },
        { addressMatchesUs: false, value: 0 }, // OP_RETURN — no address match
      ],
    };
    const lookup = (txid: string, vout: number) => {
      if (txid === PREV_TXID && vout === 0) return { address: USER_ADDR, value: 10000 };
      return null;
    };
    expect(computeBtcDelta(tx, lookup, ourAddresses)).toBe(-200n); // fee
  });

  it('no inputs ours and no outputs ours → zero delta', () => {
    const tx = {
      txid: 'foo',
      vin: [{ txid: PREV_TXID, vout: 0 }],
      vout: [{ addressMatchesUs: false, value: 5000 }],
    };
    const lookup = () => null;
    expect(computeBtcDelta(tx, lookup, ourAddresses)).toBe(0n);
  });
});
