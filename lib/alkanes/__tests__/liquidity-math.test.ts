/**
 * Pure-math coverage for AddLiquidity / RemoveLiquidity helpers.
 *
 * These two functions live on the slippage-critical path for the
 * liquidity UI:
 *   - computePairedLpAmount: drives the auto-complete behaviour when
 *     the user types one side of the pair; a regression here would
 *     show wrong-by-default token amounts and lose users money to MEV
 *     when the slippage gate falls back to 0.
 *   - computeRemoveLiquidityMinAmounts: builds the slippage floor for
 *     `Burn` — must throw on zero supply / zero reserves rather than
 *     silently producing min=0 (MEV exposure).
 *
 * Both are pure BigNumber math so they're cheap to pin extensively.
 */

import { describe, it, expect } from 'vitest';
import {
  computePairedLpAmount,
  computeRemoveLiquidityMinAmounts,
  type PairedAmountInput,
} from '../liquidity-math';

const FRBTC_ID = '32:0';
const DIESEL_ID = '2:0';

const BASE_PAIRED: PairedAmountInput = {
  typedDisplay: '1',
  typedSide: 0,
  uiToken0Id: DIESEL_ID,
  uiToken1Id: FRBTC_ID,
  poolToken0Id: DIESEL_ID,
  reserve0: (100_000n * 10n ** 8n).toString(),
  reserve1: (1_000n * 10n ** 8n).toString(),
  frbtcId: FRBTC_ID,
  wrapFeePerThousand: 0,
};

function basePaired(over: Partial<PairedAmountInput> = {}): PairedAmountInput {
  return { ...BASE_PAIRED, ...over };
}

describe('computePairedLpAmount', () => {
  describe('null guards', () => {
    it('returns null when reserve0 is zero', () => {
      expect(computePairedLpAmount(basePaired({ reserve0: '0' }))).toBeNull();
    });
    it('returns null when reserve1 is zero', () => {
      expect(computePairedLpAmount(basePaired({ reserve1: '0' }))).toBeNull();
    });
    it('returns null on empty typed display', () => {
      expect(computePairedLpAmount(basePaired({ typedDisplay: '' }))).toBeNull();
    });
    it('returns null on zero typed display', () => {
      expect(computePairedLpAmount(basePaired({ typedDisplay: '0' }))).toBeNull();
    });
    it('returns null on non-numeric typed display', () => {
      expect(computePairedLpAmount(basePaired({ typedDisplay: 'oops' }))).toBeNull();
    });
  });

  describe('aligned UI sides (UI order matches pool order)', () => {
    it('typed token0 (DIESEL) → paired token1 (frBTC) at pool ratio', () => {
      // reserve0=100k DIESEL, reserve1=1k frBTC → 1 DIESEL pairs with 0.01 frBTC.
      const result = computePairedLpAmount(basePaired({
        typedDisplay: '1', typedSide: 0,
      }));
      expect(result).toBe('0.01');
    });

    it('typed token1 (frBTC) → paired token0 (DIESEL) at inverse ratio', () => {
      // Typing 0.01 frBTC must pair with 1 DIESEL.
      const result = computePairedLpAmount(basePaired({
        typedDisplay: '0.01', typedSide: 1,
      }));
      expect(result).toBe('1');
    });

    it('preserves linearity: 2× the input → 2× the paired output', () => {
      const single = computePairedLpAmount(basePaired({ typedDisplay: '1' }))!;
      const double = computePairedLpAmount(basePaired({ typedDisplay: '2' }))!;
      const a = parseFloat(single);
      const b = parseFloat(double);
      expect(b / a).toBeCloseTo(2, 8);
    });
  });

  describe('flipped UI sides (pool order is opposite of UI)', () => {
    it('typed UI-side-0 against a flipped pool still hits the right reserve', () => {
      // UI 0=DIESEL, UI 1=frBTC; pool 0=frBTC, pool 1=DIESEL. Typing 1 DIESEL
      // on UI side 0 must pair the FRBTC reserve (pool side 0) inversely.
      const result = computePairedLpAmount(basePaired({
        uiToken0Id: DIESEL_ID,
        uiToken1Id: FRBTC_ID,
        poolToken0Id: FRBTC_ID,
        // Pool reserves: 1k frBTC / 100k DIESEL — same product so the
        // paired result for 1 DIESEL must again be 0.01 frBTC.
        reserve0: (1_000n * 10n ** 8n).toString(),
        reserve1: (100_000n * 10n ** 8n).toString(),
        typedDisplay: '1',
        typedSide: 0,
      }));
      expect(result).toBe('0.01');
    });
  });

  describe('BTC ↔ frBTC equivalence', () => {
    it('treats BTC as frBTC for pool-side alignment', () => {
      // UI 0=BTC, UI 1=DIESEL; pool 0=frBTC, pool 1=DIESEL.
      // Sides should align since 'btc' is treated as frBTC. Typing 1 BTC
      // → 100 DIESEL at the test pool ratio (100k DIESEL / 1k frBTC).
      const result = computePairedLpAmount({
        ...basePaired(),
        uiToken0Id: 'btc',
        uiToken1Id: DIESEL_ID,
        poolToken0Id: FRBTC_ID,
        reserve0: (1_000n * 10n ** 8n).toString(), // frBTC
        reserve1: (100_000n * 10n ** 8n).toString(), // DIESEL
        typedDisplay: '1',
        typedSide: 0,
      });
      expect(result).toBe('100');
    });

    it('applies wrap fee on the way in when typing BTC', () => {
      // wrapFeePerThousand=5 = 0.5% wrap fee. Typing 1 BTC produces 0.995
      // frBTC of effective input, which at a 1:100 pool ratio pairs with
      // 99.5 DIESEL.
      const result = computePairedLpAmount({
        ...basePaired(),
        uiToken0Id: 'btc',
        uiToken1Id: DIESEL_ID,
        poolToken0Id: FRBTC_ID,
        reserve0: (1_000n * 10n ** 8n).toString(),
        reserve1: (100_000n * 10n ** 8n).toString(),
        typedDisplay: '1',
        typedSide: 0,
        wrapFeePerThousand: 5,
      });
      expect(result).toBe('99.5');
    });

    it('divides by wrap fee on the way out when paired is BTC', () => {
      // Inverse: typing 99.5 DIESEL on UI side 1 should pair with ~1 BTC
      // on UI side 0 (the BTC equivalent of 0.995 frBTC).
      const result = computePairedLpAmount({
        ...basePaired(),
        uiToken0Id: 'btc',
        uiToken1Id: DIESEL_ID,
        poolToken0Id: FRBTC_ID,
        reserve0: (1_000n * 10n ** 8n).toString(),
        reserve1: (100_000n * 10n ** 8n).toString(),
        typedDisplay: '99.5',
        typedSide: 1,
        wrapFeePerThousand: 5,
      });
      // Expected: 99.5 DIESEL → 0.995 frBTC → /(1 - 0.005) = 1 BTC
      expect(parseFloat(result!)).toBeCloseTo(1.0, 6);
    });
  });

  describe('formatting', () => {
    it('strips trailing zeros from the output', () => {
      // 1 DIESEL at ratio 1:0.01 → "0.01" (not "0.01000000")
      expect(computePairedLpAmount(basePaired({ typedDisplay: '1' }))).not.toMatch(/0$/);
    });
  });
});

describe('computeRemoveLiquidityMinAmounts', () => {
  it('throws when LP supply is zero — caller must abort, not silently produce min=0 (MEV exposure)', () => {
    expect(() => computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '1',
      reserve0: '100',
      reserve1: '100',
      lpTotalSupply: '0',
      maxSlippagePercent: '0.5',
    })).toThrow(/supply is zero/i);
  });

  it('throws when reserves are zero or missing', () => {
    expect(() => computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '1',
      reserve0: '0',
      reserve1: '100',
      lpTotalSupply: '100',
      maxSlippagePercent: '0.5',
    })).toThrow(/reserves are zero/i);
    expect(() => computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '1',
      reserve0: '100',
      reserve1: '0',
      lpTotalSupply: '100',
      maxSlippagePercent: '0.5',
    })).toThrow(/reserves are zero/i);
  });

  it('applies slippage symmetrically to both sides', () => {
    // lp/supply = 0.5 → user's share is 50% of each reserve.
    // expected0 = 0.5 * 1000 = 500 DIESEL display
    // expected1 = 0.5 * 100 = 50 frBTC display
    // 1% slippage → min0 = 495, min1 = 49.5
    const result = computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '0.5',
      reserve0: (1_000n * 10n ** 8n).toString(),
      reserve1: (100n * 10n ** 8n).toString(),
      lpTotalSupply: (1n * 10n ** 8n).toString(),
      maxSlippagePercent: '1',
    });
    expect(parseFloat(result.minAmount0)).toBeCloseTo(495, 4);
    expect(parseFloat(result.minAmount1)).toBeCloseTo(49.5, 4);
  });

  it('rounds the slippage min DOWN (floor) — never gives the user a min higher than realistic', () => {
    // Pick a fractional case: lp=0.123, supply=1, reserve=1000, slip=0.1%
    // expected = 0.123 * 1000 * 1e8 = 12_300_000_000  (raw sub-units)
    // *slip 0.999 = 12_287_700_000
    // floor (no change) → 12_287_700_000
    // display = 122.877
    const result = computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '0.123',
      reserve0: (1_000n * 10n ** 8n).toString(),
      reserve1: (100n * 10n ** 8n).toString(),
      lpTotalSupply: (1n * 10n ** 8n).toString(),
      maxSlippagePercent: '0.1',
    });
    expect(parseFloat(result.minAmount0)).toBeCloseTo(122.877, 4);
  });

  it('handles 0% slippage as a no-op (min = expected)', () => {
    const result = computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '0.5',
      reserve0: (1_000n * 10n ** 8n).toString(),
      reserve1: (100n * 10n ** 8n).toString(),
      lpTotalSupply: (1n * 10n ** 8n).toString(),
      maxSlippagePercent: '0',
    });
    expect(parseFloat(result.minAmount0)).toBeCloseTo(500, 4);
    expect(parseFloat(result.minAmount1)).toBeCloseTo(50, 4);
  });

  it('handles 100% slippage by producing min=0 (no protection — explicit choice)', () => {
    const result = computeRemoveLiquidityMinAmounts({
      lpAmountDisplay: '0.5',
      reserve0: (1_000n * 10n ** 8n).toString(),
      reserve1: (100n * 10n ** 8n).toString(),
      lpTotalSupply: (1n * 10n ** 8n).toString(),
      maxSlippagePercent: '100',
    });
    expect(parseFloat(result.minAmount0)).toBe(0);
    expect(parseFloat(result.minAmount1)).toBe(0);
  });
});
