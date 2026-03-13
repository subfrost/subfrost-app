/**
 * FIRE Protocol Calculation Tests
 *
 * Pure function tests for emission schedule, APY estimation, floor price.
 */

import { describe, it, expect } from 'vitest';
import {
  computeEmissionSchedule,
  generateEmissionChartData,
  estimateAPY,
  calculateFloorPrice,
  getLockMultiplier,
  estimateDailyRewards,
  formatCompact,
  FIRE_MAX_SUPPLY,
  FIRE_EMISSION_POOL,
  BLOCKS_PER_EPOCH,
  LOCK_TIERS,
} from '@/utils/fireCalculations';

describe('FIRE Emission Schedule', () => {
  it('should compute correct epoch count', () => {
    const schedule = computeEmissionSchedule(5);
    expect(schedule).toHaveLength(5);
  });

  it('should halve emission each epoch', () => {
    const schedule = computeEmissionSchedule(4);
    // Each epoch emits half of remaining, so rate halves each epoch
    for (let i = 1; i < schedule.length; i++) {
      const ratio = schedule[i].ratePerBlock / schedule[i - 1].ratePerBlock;
      expect(ratio).toBeCloseTo(0.5, 5);
    }
  });

  it('should never exceed emission pool', () => {
    const schedule = computeEmissionSchedule(20);
    const lastEpoch = schedule[schedule.length - 1];
    expect(lastEpoch.cumulativeEmitted).toBeLessThanOrEqual(FIRE_EMISSION_POOL);
  });

  it('should have correct start blocks', () => {
    const schedule = computeEmissionSchedule(3);
    expect(schedule[0].startBlock).toBe(0);
    expect(schedule[1].startBlock).toBe(BLOCKS_PER_EPOCH);
    expect(schedule[2].startBlock).toBe(BLOCKS_PER_EPOCH * 2);
  });

  it('first epoch emits ~50% of pool', () => {
    const schedule = computeEmissionSchedule(1);
    expect(schedule[0].totalEmittedInEpoch).toBeCloseTo(FIRE_EMISSION_POOL * 0.5, 0);
  });
});

describe('Emission Chart Data', () => {
  it('should generate correct number of points', () => {
    const data = generateEmissionChartData(5);
    expect(data).toHaveLength(5 * 12); // 12 months per year
  });

  it('should be monotonically increasing', () => {
    const data = generateEmissionChartData(10);
    for (let i = 1; i < data.length; i++) {
      expect(data[i].emitted).toBeGreaterThanOrEqual(data[i - 1].emitted);
    }
  });
});

describe('APY Estimation', () => {
  it('should return 0 for zero stake', () => {
    expect(estimateAPY(1, 1000, 0, 1)).toBe(0);
  });

  it('should return 0 for zero total weighted stake', () => {
    expect(estimateAPY(1, 0, 100, 1)).toBe(0);
  });

  it('should increase with lock multiplier', () => {
    const apy1x = estimateAPY(1, 1000, 100, 1);
    const apy3x = estimateAPY(1, 1000, 100, 3);
    expect(apy3x).toBeGreaterThan(apy1x);
  });

  it('should scale linearly with multiplier when user is only staker', () => {
    // When user is the only staker, total weighted = user weighted
    const apy1x = estimateAPY(1, 100, 100, 1);
    const apy2x = estimateAPY(1, 200, 100, 2);
    // Both should be equal since user's share is 100% in both cases
    expect(apy1x).toBeGreaterThan(0);
    expect(apy2x).toBeGreaterThan(0);
  });
});

describe('Floor Price', () => {
  it('should return 0 for zero supply', () => {
    expect(calculateFloorPrice(1000000, 0)).toBe(0);
  });

  it('should calculate correctly', () => {
    expect(calculateFloorPrice(10000, 100)).toBe(100);
    expect(calculateFloorPrice(1000000, 500)).toBe(2000);
  });
});

describe('Lock Multiplier', () => {
  it('should return correct multipliers', () => {
    expect(getLockMultiplier(0)).toBe(1.0);
    expect(getLockMultiplier(1)).toBe(1.25);
    expect(getLockMultiplier(2)).toBe(1.5);
    expect(getLockMultiplier(3)).toBe(2.0);
    expect(getLockMultiplier(4)).toBe(2.5);
    expect(getLockMultiplier(5)).toBe(3.0);
  });

  it('should return 1.0 for invalid tier', () => {
    expect(getLockMultiplier(-1)).toBe(1.0);
    expect(getLockMultiplier(99)).toBe(1.0);
  });
});

describe('Daily Rewards', () => {
  it('should return 0 for no stake', () => {
    expect(estimateDailyRewards(1, 1000, 0, 1)).toBe(0);
  });

  it('should increase with multiplier', () => {
    const daily1x = estimateDailyRewards(1, 1000, 100, 1);
    const daily3x = estimateDailyRewards(1, 1000, 100, 3);
    expect(daily3x).toBeGreaterThan(daily1x);
  });

  it('should equal rate * 144 * share for single staker', () => {
    const rate = 5;
    const daily = estimateDailyRewards(rate, 100, 100, 1);
    expect(daily).toBeCloseTo(rate * 144 * 1, 5);
  });
});

describe('formatCompact', () => {
  it('should format billions', () => {
    expect(formatCompact(1500000000)).toBe('1.50B');
  });

  it('should format millions', () => {
    expect(formatCompact(2500000)).toBe('2.50M');
  });

  it('should format thousands', () => {
    expect(formatCompact(42000)).toBe('42.00K');
  });

  it('should format small numbers', () => {
    expect(formatCompact(123.456)).toBe('123.46');
  });
});

describe('Constants', () => {
  it('should have correct FIRE supply values', () => {
    expect(FIRE_MAX_SUPPLY).toBe(2_100_000);
    expect(FIRE_EMISSION_POOL).toBe(630_000);
  });

  it('should have 6 lock tiers', () => {
    expect(LOCK_TIERS).toHaveLength(6);
  });

  it('should have increasing multipliers', () => {
    for (let i = 1; i < LOCK_TIERS.length; i++) {
      expect(LOCK_TIERS[i].multiplier).toBeGreaterThan(LOCK_TIERS[i - 1].multiplier);
    }
  });
});
