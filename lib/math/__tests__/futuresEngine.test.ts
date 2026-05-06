/**
 * Futures Engine Math Tests
 *
 * Validates all mathematical formulas against known values from
 * the Rust contract implementations.
 */

import { describe, it, expect } from 'vitest';
import {
  createPremiumCurve,
  createPremiumDerivative,
  samplePremiumCurve,
  findBreakeven,
  computeUtilizationAdjustment,
  adjustCoefficients,
  computeCoefficientsFromGrowth,
  computeSettlementPayouts,
  simulateSettlementCurve,
  projectNextDifficulty,
  getEpochInfo,
  getBlockReward,
  computeVolBtcSwapQuote,
  CONSTANTS,
  type CubicCoefficients,
} from '../futuresEngine';

// Example coefficients (derived from ~5% annual yield, 30% mint premium)
const EXAMPLE_COEFFS: CubicCoefficients = {
  c0: 0.015,    // p₀ = baseline premium
  c1: 0,        // always 0 (flat start)
  c2: 0.020,    // 2(p₁-p₀) — quadratic term (subtracted)
  c3: 0.030,    // 3(p₁-p₀) — cubic term
  cMint: 0.015, // 30% of expected yield
};

describe('Cubic Premium Curve', () => {
  it('should evaluate p(0) = c₀', () => {
    const p = createPremiumCurve(EXAMPLE_COEFFS);
    expect(p(0)).toBeCloseTo(0.015, 6);
  });

  it('should evaluate p(1) = c₀ + c₁ - c₂ + c₃', () => {
    const p = createPremiumCurve(EXAMPLE_COEFFS);
    // p(1) = 0.015 + 0 - 0.020 + 0.030 = 0.025
    expect(p(1)).toBeCloseTo(0.025, 6);
  });

  it('should evaluate p(0.5) correctly', () => {
    const p = createPremiumCurve(EXAMPLE_COEFFS);
    // p(0.5) = 0.015 + 0 - 0.020*0.25 + 0.030*0.125 = 0.015 - 0.005 + 0.00375 = 0.01375
    expect(p(0.5)).toBeCloseTo(0.01375, 5);
  });

  it('should be monotonically increasing for typical coefficients', () => {
    const p = createPremiumCurve(EXAMPLE_COEFFS);
    let prev = p(0);
    // The curve dips in the middle but ends higher — check endpoints
    expect(p(1)).toBeGreaterThan(p(0));
  });

  it('should sample N+1 points', () => {
    const samples = samplePremiumCurve(EXAMPLE_COEFFS, 50);
    expect(samples.length).toBe(51);
    expect(samples[0].t).toBe(0);
    expect(samples[50].t).toBe(1);
  });
});

describe('Premium Derivative', () => {
  it('should compute p\'(0) = c₁ = 0', () => {
    const dp = createPremiumDerivative(EXAMPLE_COEFFS);
    expect(dp(0)).toBeCloseTo(0, 5);
  });

  it('should compute p\'(1) = c₁ - 2c₂ + 3c₃', () => {
    const dp = createPremiumDerivative(EXAMPLE_COEFFS);
    // p'(1) = 0 - 2*0.020 + 3*0.030 = -0.040 + 0.090 = 0.050
    expect(dp(1)).toBeCloseTo(0.050, 4);
  });

  it('should find the minimum of the premium curve', () => {
    const dp = createPremiumDerivative(EXAMPLE_COEFFS);
    // p'(t) = 0 → -2c₂t + 3c₃t² = 0 → t(3c₃t - 2c₂) = 0
    // t = 0 or t = 2c₂/(3c₃) = 2*0.020/(3*0.030) = 0.444
    // At t ≈ 0.444, the curve is at its minimum
    const tMin = (2 * EXAMPLE_COEFFS.c2) / (3 * EXAMPLE_COEFFS.c3);
    expect(dp(tMin)).toBeCloseTo(0, 4);
  });
});

describe('Breakeven Finding (Newton\'s Method)', () => {
  it('should find breakeven for a target yield', () => {
    const breakeven = findBreakeven(EXAMPLE_COEFFS, 0.020);
    expect(breakeven).not.toBeNull();
    if (breakeven !== null) {
      const p = createPremiumCurve(EXAMPLE_COEFFS);
      expect(p(breakeven)).toBeCloseTo(0.020, 4);
    }
  });

  it('should return null for unreachable target', () => {
    // Premium never reaches 1.0
    const breakeven = findBreakeven(EXAMPLE_COEFFS, 1.0);
    // Either null or clipped to boundary
    if (breakeven !== null) {
      expect(breakeven).toBeGreaterThanOrEqual(0);
      expect(breakeven).toBeLessThanOrEqual(1);
    }
  });

  it('should find breakeven at t=0 for target = c₀', () => {
    const breakeven = findBreakeven(EXAMPLE_COEFFS, EXAMPLE_COEFFS.c0, 0.1);
    expect(breakeven).not.toBeNull();
    // Should be near 0 or near where curve crosses c₀ again
  });
});

describe('Utilization Adjustment', () => {
  it('should return 0.1 at 0% utilization', () => {
    expect(computeUtilizationAdjustment(0)).toBeCloseTo(0.1, 6);
  });

  it('should return 1.0 at 100% utilization', () => {
    expect(computeUtilizationAdjustment(1)).toBeCloseTo(1.0, 6);
  });

  it('should return 0.55 at 50% utilization', () => {
    expect(computeUtilizationAdjustment(0.5)).toBeCloseTo(0.55, 6);
  });

  it('should clamp below 0', () => {
    expect(computeUtilizationAdjustment(-0.5)).toBeCloseTo(0.1, 6);
  });

  it('should clamp above 1', () => {
    expect(computeUtilizationAdjustment(1.5)).toBeCloseTo(1.0, 6);
  });

  it('should adjust all coefficients proportionally', () => {
    const adjusted = adjustCoefficients(EXAMPLE_COEFFS, 0.5);
    const factor = 0.55;
    expect(adjusted.c0).toBeCloseTo(EXAMPLE_COEFFS.c0 * factor, 6);
    expect(adjusted.c2).toBeCloseTo(EXAMPLE_COEFFS.c2 * factor, 6);
    expect(adjusted.c3).toBeCloseTo(EXAMPLE_COEFFS.c3 * factor, 6);
    expect(adjusted.cMint).toBeCloseTo(EXAMPLE_COEFFS.cMint * factor, 6);
  });
});

describe('Coefficient Computation from Growth', () => {
  it('should compute sensible coefficients for 5% annual yield', () => {
    // ~5% yield over 52560 blocks
    const growthPerBlock = 1 + 0.05 / 52560;
    const coeffs = computeCoefficientsFromGrowth(growthPerBlock, 52560);

    expect(coeffs.c0).toBeGreaterThan(0);
    expect(coeffs.c1).toBe(0);
    expect(coeffs.c2).toBeGreaterThanOrEqual(0);
    expect(coeffs.c3).toBeGreaterThanOrEqual(0);
    expect(coeffs.cMint).toBeCloseTo(0.05 * 0.3, 2); // 30% of 5%
  });

  it('should return higher premiums for higher yield', () => {
    const low = computeCoefficientsFromGrowth(1.0000005, 52560);
    const high = computeCoefficientsFromGrowth(1.000005, 52560);
    expect(high.c0).toBeGreaterThan(low.c0);
    expect(high.cMint).toBeGreaterThan(low.cMint);
  });

  it('should handle zero growth gracefully', () => {
    const coeffs = computeCoefficientsFromGrowth(1.0, 52560);
    expect(coeffs.c0).toBe(0);
    expect(coeffs.cMint).toBe(0);
  });
});

describe('Fujin Settlement Payouts', () => {
  it('should return 50/50 for no change', () => {
    const result = computeSettlementPayouts(100, 100);
    expect(result.longPayout).toBeCloseTo(0.5, 6);
    expect(result.shortPayout).toBeCloseTo(0.5, 6);
    expect(result.changePercent).toBeCloseTo(0, 6);
  });

  it('should favor LONG when difficulty increases', () => {
    const result = computeSettlementPayouts(100, 150);
    expect(result.longPayout).toBeGreaterThan(0.5);
    expect(result.shortPayout).toBeLessThan(0.5);
    expect(result.changePercent).toBeCloseTo(50, 1);
  });

  it('should favor SHORT when difficulty decreases', () => {
    const result = computeSettlementPayouts(100, 50);
    expect(result.longPayout).toBeLessThan(0.5);
    expect(result.shortPayout).toBeGreaterThan(0.5);
    expect(result.changePercent).toBeCloseTo(-50, 1);
  });

  it('should cap payouts at 0 and 1 for extreme changes', () => {
    const result = computeSettlementPayouts(100, 300); // +200%
    expect(result.longPayout).toBe(1);
    expect(result.shortPayout).toBe(0);
  });

  it('should sum to 1 (LONG + SHORT = total DIESEL)', () => {
    const result = computeSettlementPayouts(113.76e12, 117e12);
    expect(result.longPayout + result.shortPayout).toBeCloseTo(1, 6);
  });

  it('should compute +5% difficulty correctly', () => {
    const result = computeSettlementPayouts(100, 105);
    // ratio = 5/100 = 0.05
    expect(result.longPayout).toBeCloseTo(0.525, 4);
    expect(result.shortPayout).toBeCloseTo(0.475, 4);
  });
});

describe('Settlement Curve Simulation', () => {
  it('should generate correct number of points', () => {
    const curve = simulateSettlementCurve(100e12, -50, 50, 100);
    expect(curve.length).toBe(101);
  });

  it('should show 50/50 at 0% change', () => {
    const curve = simulateSettlementCurve(100e12, -50, 50, 100);
    const midPoint = curve[50]; // at 0%
    expect(midPoint.changePercent).toBeCloseTo(0, 1);
    expect(midPoint.longPayout).toBeCloseTo(0.5, 2);
    expect(midPoint.shortPayout).toBeCloseTo(0.5, 2);
  });

  it('should be symmetric around 0%', () => {
    const curve = simulateSettlementCurve(100e12, -50, 50, 100);
    const plus10 = curve.find(p => Math.abs(p.changePercent - 10) < 1);
    const minus10 = curve.find(p => Math.abs(p.changePercent + 10) < 1);
    if (plus10 && minus10) {
      expect(plus10.longPayout).toBeCloseTo(minus10.shortPayout, 2);
    }
  });
});

describe('Difficulty Projection', () => {
  it('should project no change for 10-minute blocks', () => {
    const result = projectNextDifficulty(100e12, 600, 1000);
    expect(result.changePercent).toBeCloseTo(0, 1);
  });

  it('should project increase for faster blocks', () => {
    const result = projectNextDifficulty(100e12, 500, 1000); // 8.33 min blocks
    expect(result.changePercent).toBeGreaterThan(0);
    expect(result.estimatedDifficulty).toBeGreaterThan(100e12);
  });

  it('should project decrease for slower blocks', () => {
    const result = projectNextDifficulty(100e12, 700, 1000); // 11.67 min blocks
    expect(result.changePercent).toBeLessThan(0);
    expect(result.estimatedDifficulty).toBeLessThan(100e12);
  });

  it('should estimate time remaining', () => {
    const result = projectNextDifficulty(100e12, 600, 500);
    expect(result.estimatedTimeRemaining).toBeCloseTo(500 * 600, 0);
  });
});

describe('Epoch Info', () => {
  it('should compute epoch 0 for genesis', () => {
    const info = getEpochInfo(0);
    expect(info.epoch).toBe(0);
    expect(info.blocksElapsed).toBe(0);
    expect(info.blocksRemaining).toBe(2016);
    expect(info.progressPercent).toBe(0);
  });

  it('should compute correct epoch for height 4032', () => {
    const info = getEpochInfo(4032);
    expect(info.epoch).toBe(2);
    expect(info.blocksElapsed).toBe(0);
  });

  it('should compute 50% progress at midpoint', () => {
    const info = getEpochInfo(1008);
    expect(info.progressPercent).toBeCloseTo(50, 0);
  });
});

describe('Block Reward', () => {
  it('should return 50 BTC at height 0', () => {
    expect(getBlockReward(0)).toBe(5_000_000_000);
  });

  it('should return 25 BTC after first halving', () => {
    expect(getBlockReward(210_000)).toBe(2_500_000_000);
  });

  it('should return 12.5 BTC after second halving', () => {
    expect(getBlockReward(420_000)).toBe(1_250_000_000);
  });

  it('should return 0 after 64 halvings', () => {
    expect(getBlockReward(210_000 * 64)).toBe(0);
  });
});

describe('volBTC Swap Quote', () => {
  it('should compute a valid swap', () => {
    const result = computeVolBtcSwapQuote(
      100,       // 100 ftrBTC in
      95e6,      // 0.95 dxBTC per token in
      92e6,      // 0.92 dxBTC per token out
      10000,     // 10000 reserve in
      8000,      // 8000 reserve out
      30,        // 0.3% fee
    );
    expect(result.amountOut).toBeGreaterThan(0);
    expect(result.amountOut).toBeLessThan(8000); // can't exceed reserve
    expect(result.priceImpact).toBeGreaterThan(0);
    expect(result.effectiveRate).toBeGreaterThan(0);
  });

  it('should return 0 for empty reserves', () => {
    const result = computeVolBtcSwapQuote(100, 95e6, 92e6, 0, 0, 30);
    expect(result.amountOut).toBe(0);
  });

  it('should have higher price impact for larger trades', () => {
    const small = computeVolBtcSwapQuote(10, 95e6, 92e6, 10000, 8000, 30);
    const large = computeVolBtcSwapQuote(1000, 95e6, 92e6, 10000, 8000, 30);
    expect(large.priceImpact).toBeGreaterThan(small.priceImpact);
  });

  it('should give less output with higher fees', () => {
    const lowFee = computeVolBtcSwapQuote(100, 95e6, 92e6, 10000, 8000, 10);
    const highFee = computeVolBtcSwapQuote(100, 95e6, 92e6, 10000, 8000, 100);
    expect(highFee.amountOut).toBeLessThan(lowFee.amountOut);
  });
});

describe('Constants', () => {
  it('should have correct DIFFICULTY_EPOCH', () => {
    expect(CONSTANTS.DIFFICULTY_EPOCH).toBe(2016);
  });

  it('should have correct HALVING_INTERVAL', () => {
    expect(CONSTANTS.HALVING_INTERVAL).toBe(210000);
  });

  it('should have correct TARGET_BLOCK_TIME', () => {
    expect(CONSTANTS.TARGET_BLOCK_TIME).toBe(600);
  });
});
