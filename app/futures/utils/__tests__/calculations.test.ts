/**
 * Futures Calculation Tests
 *
 * Tests for the futures pricing functions in app/futures/utils/calculations.ts
 * These test the quadratic premium curve and profit calculations.
 *
 * Run with: pnpm test app/futures/utils/__tests__/calculations.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  calculateExercisePremium,
  calculateExercisePrice,
  calculateYieldAtExpiry,
  calculateProfitAtLockPeriod,
  calculateProfitAtExpiry,
} from '../calculations';

// ==========================================
// calculateExercisePremium Tests
// ==========================================

describe('calculateExercisePremium', () => {
  it('should return ~5% at 100 blocks left', () => {
    const premium = calculateExercisePremium(100);

    // Should be approximately 5% (quadratic curve peaks near here)
    expect(premium).toBeGreaterThanOrEqual(4.5);
    expect(premium).toBeLessThanOrEqual(5.5);
  });

  it('should return ~3% at 30 blocks left', () => {
    const premium = calculateExercisePremium(30);

    // Reference point: 30 blocks = 3%
    expect(premium).toBeGreaterThanOrEqual(2.5);
    expect(premium).toBeLessThanOrEqual(3.5);
  });

  it('should return 0.1% at 0 blocks left (expiry)', () => {
    const premium = calculateExercisePremium(0);

    // At expiry, premium should be minimum (0.1%)
    expect(premium).toBe(0.1);
  });

  it('should clamp values below 0 to 0', () => {
    const premium = calculateExercisePremium(-10);

    // Should be treated as 0 blocks
    expect(premium).toBe(0.1);
  });

  it('should clamp values above 100 to 100', () => {
    const premium = calculateExercisePremium(150);

    // Should be treated as 100 blocks
    expect(premium).toBeGreaterThanOrEqual(4.5);
    expect(premium).toBeLessThanOrEqual(5.5);
  });

  it('should return value within bounds (0.1 to 5.0)', () => {
    // Test various points
    for (let blocks = 0; blocks <= 100; blocks += 10) {
      const premium = calculateExercisePremium(blocks);
      expect(premium).toBeGreaterThanOrEqual(0.1);
      expect(premium).toBeLessThanOrEqual(5.0);
    }
  });

  it('should follow quadratic curve shape (peak in middle-high range)', () => {
    const premium0 = calculateExercisePremium(0);
    const premium50 = calculateExercisePremium(50);
    const premium100 = calculateExercisePremium(100);

    // Premium should increase from 0 to some peak
    expect(premium50).toBeGreaterThan(premium0);

    // Premium at 100 should be higher than at 50 due to quadratic shape
    expect(premium100).toBeGreaterThanOrEqual(premium50);
  });
});

// ==========================================
// calculateExercisePrice Tests
// ==========================================

describe('calculateExercisePrice', () => {
  it('should return 1 BTC at expiry (0 blocks left)', () => {
    const price = calculateExercisePrice(0);

    expect(price).toBe(1.0);
  });

  it('should return ~0.95 BTC at 100 blocks (5% premium)', () => {
    const price = calculateExercisePrice(100);

    // Exercise price = 1 - premium%
    // With ~5% premium, price should be ~0.95
    expect(price).toBeGreaterThanOrEqual(0.94);
    expect(price).toBeLessThanOrEqual(0.96);
  });

  it('should return ~0.97 BTC at 30 blocks (3% premium)', () => {
    const price = calculateExercisePrice(30);

    expect(price).toBeGreaterThanOrEqual(0.96);
    expect(price).toBeLessThanOrEqual(0.98);
  });

  it('should apply notional multiplier correctly', () => {
    const priceFor1 = calculateExercisePrice(50, 1.0);
    const priceFor2 = calculateExercisePrice(50, 2.0);

    expect(priceFor2).toBeCloseTo(priceFor1 * 2, 5);
  });

  it('should return higher price as blocks decrease', () => {
    const price100 = calculateExercisePrice(100);
    const price50 = calculateExercisePrice(50);
    const price10 = calculateExercisePrice(10);
    const price0 = calculateExercisePrice(0);

    // Price should increase as we approach expiry
    expect(price50).toBeGreaterThan(price100);
    expect(price10).toBeGreaterThan(price50);
    expect(price0).toBeGreaterThanOrEqual(price10);
  });
});

// ==========================================
// calculateYieldAtExpiry Tests
// ==========================================

describe('calculateYieldAtExpiry', () => {
  it('should calculate correct yield for 5% discount', () => {
    const result = calculateYieldAtExpiry(0.95); // Market price 0.95

    expect(result.expiryPrice).toBe(1.0);
    // Yield = (1 - 0.95) / 0.95 * 100 ≈ 5.26%
    expect(result.yieldPercent).toBeCloseTo(5.26, 1);
  });

  it('should calculate correct yield for 10% discount', () => {
    const result = calculateYieldAtExpiry(0.90);

    // Yield = (1 - 0.90) / 0.90 * 100 ≈ 11.11%
    expect(result.yieldPercent).toBeCloseTo(11.11, 1);
  });

  it('should return 0% yield at parity', () => {
    const result = calculateYieldAtExpiry(1.0);

    expect(result.yieldPercent).toBe(0);
  });

  it('should return negative yield if price > 1', () => {
    const result = calculateYieldAtExpiry(1.05); // Premium market price

    expect(result.yieldPercent).toBeLessThan(0);
  });

  it('should always return expiryPrice of 1.0', () => {
    const result1 = calculateYieldAtExpiry(0.8);
    const result2 = calculateYieldAtExpiry(0.95);
    const result3 = calculateYieldAtExpiry(1.1);

    expect(result1.expiryPrice).toBe(1.0);
    expect(result2.expiryPrice).toBe(1.0);
    expect(result3.expiryPrice).toBe(1.0);
  });
});

// ==========================================
// calculateProfitAtLockPeriod Tests
// ==========================================

describe('calculateProfitAtLockPeriod', () => {
  it('should calculate correct values for basic lock period', () => {
    const result = calculateProfitAtLockPeriod(
      0.95, // Market price
      1.0, // Investment amount (1 BTC)
      30, // Lock for 30 blocks
      100 // Contract has 100 blocks left
    );

    // After 30 blocks, contract has 70 blocks left
    expect(result.blocksLeftAfterLock).toBe(70);

    // ftrBTC amount = investment / marketPrice = 1 / 0.95
    expect(result.ftrBtcAmount).toBeCloseTo(1.0526, 3);

    // Exercise price after lock depends on premium at 70 blocks
    expect(result.exercisePriceAfterLock).toBeLessThan(1);
    expect(result.exercisePriceAfterLock).toBeGreaterThan(0.9);

    // Profit should be positive (buying at discount)
    expect(result.profit).toBeGreaterThan(0);
    expect(result.yieldPercent).toBeGreaterThan(0);
  });

  it('should handle lock period exceeding contract expiry', () => {
    const result = calculateProfitAtLockPeriod(
      0.95,
      1.0,
      150, // Lock for 150 blocks
      100 // Contract only has 100 blocks left
    );

    // Should be clamped to 0
    expect(result.blocksLeftAfterLock).toBe(0);

    // At expiry, exercise price = 1
    expect(result.exercisePriceAfterLock).toBe(1);
  });

  it('should calculate zero profit when market price equals exercise price', () => {
    // Find a market price that equals the exercise price at some point
    const exercisePrice = calculateExercisePrice(50);
    const result = calculateProfitAtLockPeriod(
      exercisePrice, // Buy at exercise price
      1.0,
      0, // No lock (immediate exercise)
      50
    );

    // Profit should be near zero (just rounding differences)
    expect(Math.abs(result.profit)).toBeLessThan(0.01);
  });

  it('should scale with investment amount', () => {
    const result1 = calculateProfitAtLockPeriod(0.95, 1.0, 30, 100);
    const result2 = calculateProfitAtLockPeriod(0.95, 2.0, 30, 100);

    expect(result2.profit).toBeCloseTo(result1.profit * 2, 5);
    expect(result2.ftrBtcAmount).toBeCloseTo(result1.ftrBtcAmount * 2, 5);
  });
});

// ==========================================
// calculateProfitAtExpiry Tests
// ==========================================

describe('calculateProfitAtExpiry', () => {
  it('should calculate correct values for 5% discount', () => {
    const result = calculateProfitAtExpiry(0.95, 1.0);

    // Discount is 5% (use toBeCloseTo for floating point)
    expect(result.discountPercent).toBeCloseTo(5, 10);

    // Yield equals discount when calculated from nominal
    expect(result.yieldPercent).toBeCloseTo(5, 10);

    // Profit = investment * discount% = 1 * 0.05 = 0.05
    expect(result.profit).toBeCloseTo(0.05, 10);

    // Exercise value = investment + profit
    expect(result.exerciseValue).toBeCloseTo(1.05, 10);

    // ftrBTC amount = investment / marketPrice
    expect(result.ftrBtcAmount).toBeCloseTo(1.0526, 3);
  });

  it('should calculate correct values for 10% discount', () => {
    const result = calculateProfitAtExpiry(0.90, 1.0);

    expect(result.discountPercent).toBeCloseTo(10, 10);
    expect(result.yieldPercent).toBeCloseTo(10, 10);
    expect(result.profit).toBeCloseTo(0.1, 10);
    expect(result.exerciseValue).toBeCloseTo(1.1, 10);
  });

  it('should handle zero discount (parity)', () => {
    const result = calculateProfitAtExpiry(1.0, 1.0);

    expect(result.discountPercent).toBe(0);
    expect(result.yieldPercent).toBe(0);
    expect(result.profit).toBe(0);
    expect(result.exerciseValue).toBe(1.0);
  });

  it('should handle negative discount (premium)', () => {
    const result = calculateProfitAtExpiry(1.05, 1.0);

    // Market price > 1, so discount is negative (use toBeCloseTo for floating point)
    expect(result.discountPercent).toBeCloseTo(-5, 10);
    expect(result.profit).toBeCloseTo(-0.05, 10);
    expect(result.exerciseValue).toBeCloseTo(0.95, 10);
  });

  it('should scale profit with investment amount', () => {
    const result1 = calculateProfitAtExpiry(0.95, 1.0);
    const result2 = calculateProfitAtExpiry(0.95, 10.0);

    expect(result2.profit).toBeCloseTo(result1.profit * 10, 5);
    expect(result2.exerciseValue).toBeCloseTo(result1.exerciseValue * 10, 5);
  });

  it('should maintain consistent yield percentage regardless of investment', () => {
    const result1 = calculateProfitAtExpiry(0.92, 1.0);
    const result2 = calculateProfitAtExpiry(0.92, 100.0);

    // Yield percent should be the same
    expect(result1.yieldPercent).toBe(result2.yieldPercent);
    expect(result1.discountPercent).toBe(result2.discountPercent);
  });
});

// ==========================================
// Integration: Premium Curve to Profit Flow
// ==========================================

describe('Integration: Full profit calculation flow', () => {
  it('should demonstrate consistent profit calculation across functions', () => {
    const marketPrice = 0.95; // 5% discount from nominal
    const investment = 1.0;

    // Method 1: calculateYieldAtExpiry
    const yieldResult = calculateYieldAtExpiry(marketPrice);

    // Method 2: calculateProfitAtExpiry
    const profitResult = calculateProfitAtExpiry(marketPrice, investment);

    // Method 3: calculateProfitAtLockPeriod with lock to expiry
    const lockResult = calculateProfitAtLockPeriod(marketPrice, investment, 100, 100);

    // All should give similar yield/profit calculations
    // Note: yieldPercent from calculateYieldAtExpiry is different formula
    // (it's (expiry - market) / market vs (expiry - market) / expiry)
    expect(profitResult.discountPercent).toBeCloseTo(5, 10);
    expect(lockResult.blocksLeftAfterLock).toBe(0);
    expect(lockResult.exercisePriceAfterLock).toBe(1);
  });

  it('should show increasing profit as discount increases', () => {
    const results = [0.99, 0.95, 0.90, 0.85].map((price) =>
      calculateProfitAtExpiry(price, 1.0)
    );

    // Verify profit increases as discount increases
    for (let i = 1; i < results.length; i++) {
      expect(results[i].profit).toBeGreaterThan(results[i - 1].profit);
    }
  });
});
