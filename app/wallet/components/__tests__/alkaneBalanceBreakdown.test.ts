/**
 * Pins the alkane availability-breakdown contract that was broken on
 * mork1e's wallet 2026-05-17 (FROST Batallion 6 screenshot): TORTILLA
 * 84,439 / FARTANE 1.65B / frBTC 0.00010624 all showed as "mempool: <full
 * confirmed>" even though mork's address had ZERO pending tx activity.
 *
 * Root cause: the old `mempoolRaw = confirmedRaw - availableRaw` heuristic
 * misclassified a data-source mismatch (espoAlkanesFromWalletCache silently
 * dropped some alkane IDs that addressAlkanes had) as 100% mempool. These
 * tests pin the fix: mempoolRaw is ONLY populated from explicit
 * pending-tx-derived `pendingByAlkane` entries. No more inferring from
 * aggregation deltas.
 */
import { describe, it, expect } from 'vitest';
import {
  getAlkaneAvailabilityBreakdown,
  getBtcAvailabilityBreakdown,
  getAvailabilityBreakdownFor,
  parseRawBalanceSafe,
  type PendingAlkaneEntry,
} from '../alkaneBalanceBreakdown';
import type { AlkaneAsset } from '@/queries/account';

const mkAlkane = (id: string, balance: string, decimals = 8): AlkaneAsset => ({
  alkaneId: id,
  name: id,
  symbol: id,
  balance,
  decimals,
});

describe('parseRawBalanceSafe', () => {
  it('returns 0n for undefined / null / empty string', () => {
    expect(parseRawBalanceSafe(undefined)).toBe(0n);
    expect(parseRawBalanceSafe(null)).toBe(0n);
    expect(parseRawBalanceSafe('')).toBe(0n);
  });
  it('parses decimal strings to bigint', () => {
    expect(parseRawBalanceSafe('84439')).toBe(84439n);
    expect(parseRawBalanceSafe('1650842060')).toBe(1650842060n);
  });
  it('returns 0n on garbage input (no throw)', () => {
    expect(parseRawBalanceSafe('not-a-number')).toBe(0n);
    expect(parseRawBalanceSafe('1.5')).toBe(0n);
  });
});

describe('getAlkaneAvailabilityBreakdown — mork1e regression class', () => {
  // -------------------------------------------------------------------------
  // mork1e's exact balances from the IMG_2437.jpeg screenshot. All three
  // should show as available, NOT as mempool, because no pending tx is
  // recorded touching these alkanes.
  // -------------------------------------------------------------------------
  const TORTILLA_CONFIRMED = 84_439n;
  const FARTANE_CONFIRMED = 1_650_842_060n;
  const FRBTC_CONFIRMED = 10_624n; // 0.00010624 frBTC in subunits

  it('TORTILLA: no pending tx → available=full, mempool=0 (the regression)', () => {
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      TORTILLA_CONFIRMED,
      undefined, // no pending entry
    );
    expect(availableRaw).toBe(TORTILLA_CONFIRMED);
    expect(mempoolRaw).toBe(0n);
  });

  it('FARTANE: no pending tx → available=full, mempool=0', () => {
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      FARTANE_CONFIRMED,
      undefined,
    );
    expect(availableRaw).toBe(FARTANE_CONFIRMED);
    expect(mempoolRaw).toBe(0n);
  });

  it('frBTC: no pending tx → available=full, mempool=0', () => {
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      FRBTC_CONFIRMED,
      undefined,
    );
    expect(availableRaw).toBe(FRBTC_CONFIRMED);
    expect(mempoolRaw).toBe(0n);
  });

  it('Confirmed balance is preserved when a pending tx is recorded but has zero delta', () => {
    const pending: PendingAlkaneEntry = { delta: 0n };
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      TORTILLA_CONFIRMED,
      pending,
    );
    expect(availableRaw).toBe(TORTILLA_CONFIRMED);
    expect(mempoolRaw).toBe(0n);
  });
});

describe('getAlkaneAvailabilityBreakdown — pending mempool cases', () => {
  it('Incoming pending tx (positive delta) appears as mempool', () => {
    const pending: PendingAlkaneEntry = { delta: 500n };
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      100n,
      pending,
    );
    expect(availableRaw).toBe(100n); // confirmed unchanged
    expect(mempoolRaw).toBe(500n);   // incoming pending
  });

  it('Outgoing pending tx (negative delta) does NOT inflate mempool incoming', () => {
    // Negative delta = user has a pending tx spending some of their alkanes.
    // For the "available / mempool incoming" split shown on the wallet card,
    // only positive deltas matter. (A future iteration may surface
    // "pending outgoing" separately; this test pins the current contract
    // so negative deltas don't accidentally show up as incoming.)
    const pending: PendingAlkaneEntry = { delta: -200n };
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      1000n,
      pending,
    );
    expect(availableRaw).toBe(1000n);
    expect(mempoolRaw).toBe(0n);
  });

  it('Real-world: user has 100 DIESEL confirmed + a pending swap inbound of 50 → shows available=100, mempool=50', () => {
    const pending: PendingAlkaneEntry = { delta: 50n };
    const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(
      100n,
      pending,
    );
    expect(availableRaw).toBe(100n);
    expect(mempoolRaw).toBe(50n);
  });
});

describe('getAvailabilityBreakdownFor — dispatch + bitcoin branch', () => {
  it('Bitcoin asset routes through the BTC pendingIn/pendingOut path', () => {
    const result = getAvailabilityBreakdownFor({
      alkane: mkAlkane('btc', '0'),
      pendingByAlkane: new Map(),
      isBitcoinAsset: true,
      btcAvailableSats: 22292,
      btcMempoolSats: 0,
    });
    expect(result.availableRaw).toBe(22292n);
    expect(result.mempoolRaw).toBe(0n);
  });

  it('Non-bitcoin asset uses pendingByAlkane for mempool (NOT a data-source delta)', () => {
    // The regression: addressAlkanes reports TORTILLA=84439 but
    // spendableByAlkane has no entry. Old code: mempool = 84439. New
    // code: mempool = 0 because pendingByAlkane has no entry.
    const result = getAvailabilityBreakdownFor({
      alkane: mkAlkane('2:68479', '84439'), // TORTILLA from mork's screenshot
      pendingByAlkane: new Map(), // KEY: no pending tx recorded
      isBitcoinAsset: false,
      btcAvailableSats: 0,
      btcMempoolSats: 0,
    });
    expect(result.availableRaw).toBe(84439n);
    expect(result.mempoolRaw).toBe(0n);
  });

  it('Non-bitcoin asset WITH a pending tx surfaces the incoming delta', () => {
    const pendingByAlkane = new Map<string, PendingAlkaneEntry>([
      ['2:68479', { delta: 500n }],
    ]);
    const result = getAvailabilityBreakdownFor({
      alkane: mkAlkane('2:68479', '84439'),
      pendingByAlkane,
      isBitcoinAsset: false,
      btcAvailableSats: 0,
      btcMempoolSats: 0,
    });
    expect(result.availableRaw).toBe(84439n);
    expect(result.mempoolRaw).toBe(500n);
  });

  it('Garbage balance string falls through to 0n availableRaw without throwing', () => {
    const result = getAvailabilityBreakdownFor({
      alkane: { alkaneId: '2:0', name: 'X', symbol: 'X', balance: 'nope' as any, decimals: 8 },
      pendingByAlkane: new Map(),
      isBitcoinAsset: false,
      btcAvailableSats: 0,
      btcMempoolSats: 0,
    });
    expect(result.availableRaw).toBe(0n);
    expect(result.mempoolRaw).toBe(0n);
  });
});

describe('getBtcAvailabilityBreakdown', () => {
  it('clamps negatives to zero', () => {
    const { availableRaw, mempoolRaw } = getBtcAvailabilityBreakdown(-100, -50);
    expect(availableRaw).toBe(0n);
    expect(mempoolRaw).toBe(0n);
  });
  it('passes through positive sats as bigint', () => {
    const { availableRaw, mempoolRaw } = getBtcAvailabilityBreakdown(100000, 5000);
    expect(availableRaw).toBe(100000n);
    expect(mempoolRaw).toBe(5000n);
  });
});
