import { describe, expect, it } from 'vitest';
import { pickPositive } from '../mergeStats';

describe('pickPositive', () => {
  it('returns 0 for no args', () => {
    expect(pickPositive()).toBe(0);
  });

  it('returns 0 if every candidate is undefined / null', () => {
    expect(pickPositive(undefined, null, undefined)).toBe(0);
  });

  it('returns 0 if every candidate is non-positive', () => {
    expect(pickPositive(0, -1, 0, -100)).toBe(0);
  });

  it('returns the first finite > 0 candidate', () => {
    expect(pickPositive(undefined, 0, 100, 200)).toBe(100);
  });

  it('skips NaN and Infinity', () => {
    expect(pickPositive(NaN, Infinity, -Infinity, 50)).toBe(50);
  });

  it('does NOT short-circuit on zero (the bug this exists to prevent)', () => {
    // Before: `pool.tvlUsd || stats?.tvlUsd || 0` returns 0 here.
    // After: `pickPositive(pool.tvlUsd, stats?.tvlUsd)` returns 385234.
    expect(pickPositive(0, 385234)).toBe(385234);
  });

  it('treats 0 as a valid "no data" sentinel and skips to next candidate', () => {
    expect(pickPositive(undefined, 0, undefined, 42)).toBe(42);
  });

  it('strict positivity — does not return negative numbers', () => {
    expect(pickPositive(-5, -10, 7)).toBe(7);
  });
});
