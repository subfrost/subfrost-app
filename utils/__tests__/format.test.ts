/**
 * Format Utility Tests
 *
 * Tests for the formatting functions in utils/format.ts
 *
 * Run with: pnpm test utils/__tests__/format.test.ts
 */

import { describe, it, expect } from 'vitest';
import { satsToBtc, formatBtc, SATS_PER_BTC } from '../format';

// ==========================================
// satsToBtc Tests
// ==========================================

describe('satsToBtc', () => {
  it('should convert 100 million sats to 1 BTC', () => {
    const btc = satsToBtc(100_000_000);
    expect(btc).toBe(1);
  });

  it('should convert 0 sats to 0 BTC', () => {
    const btc = satsToBtc(0);
    expect(btc).toBe(0);
  });

  it('should convert small amounts correctly', () => {
    const btc = satsToBtc(1);
    expect(btc).toBe(0.00000001);
  });

  it('should convert 50 million sats to 0.5 BTC', () => {
    const btc = satsToBtc(50_000_000);
    expect(btc).toBe(0.5);
  });

  it('should handle large amounts', () => {
    const btc = satsToBtc(2_100_000_000_000_000); // 21M BTC in sats
    expect(btc).toBe(21_000_000);
  });

  it('should handle non-finite values', () => {
    expect(satsToBtc(NaN)).toBe(0);
    expect(satsToBtc(Infinity)).toBe(0);
    expect(satsToBtc(-Infinity)).toBe(0);
  });

  it('should handle negative values', () => {
    const btc = satsToBtc(-100_000_000);
    expect(btc).toBe(-1);
  });
});

// ==========================================
// formatBtc Tests
// ==========================================

describe('formatBtc', () => {
  it('should format 1 BTC correctly', () => {
    const formatted = formatBtc(1);
    expect(formatted).toBe('1');
  });

  it('should format 0 as 0.00000000', () => {
    const formatted = formatBtc(0);
    expect(formatted).toBe('0.00000000');
  });

  it('should format decimal amounts with appropriate precision', () => {
    const formatted = formatBtc(0.5);
    // formatBtc uses minimumFractionDigits: 2, so 0.5 becomes '0.50'
    expect(formatted).toBe('0.50');
  });

  it('should format very small amounts as sats', () => {
    const formatted = formatBtc(0.0000001); // 10 sats
    expect(formatted).toBe('10 sats');
  });

  it('should format 1 sat correctly', () => {
    const formatted = formatBtc(0.00000001);
    expect(formatted).toBe('1 sats');
  });

  it('should handle non-finite values', () => {
    expect(formatBtc(NaN)).toBe('0.00000000');
    expect(formatBtc(Infinity)).toBe('0.00000000');
    expect(formatBtc(-Infinity)).toBe('0.00000000');
  });

  it('should format amounts with 8 decimal places max', () => {
    const formatted = formatBtc(1.12345678);
    expect(formatted).toBe('1.12345678');
  });

  it('should use US locale formatting with commas for thousands', () => {
    const formatted = formatBtc(1000.5);
    // formatBtc uses minimumFractionDigits: 2
    expect(formatted).toBe('1,000.50');
  });

  it('should format large amounts correctly', () => {
    const formatted = formatBtc(21000000);
    expect(formatted).toBe('21,000,000');
  });

  it('should handle negative amounts', () => {
    const formatted = formatBtc(-0.5);
    // formatBtc uses minimumFractionDigits: 2
    expect(formatted).toBe('-0.50');
  });

  it('should handle threshold between decimal and sats format', () => {
    // Just above threshold (0.000001)
    const aboveThreshold = formatBtc(0.000001);
    expect(aboveThreshold).not.toContain('sats');

    // Just below threshold
    const belowThreshold = formatBtc(0.0000009);
    expect(belowThreshold).toContain('sats');
  });
});

// ==========================================
// SATS_PER_BTC Constant
// ==========================================

describe('SATS_PER_BTC', () => {
  it('should be 100 million', () => {
    expect(SATS_PER_BTC).toBe(100_000_000);
  });
});

// ==========================================
// Integration: satsToBtc -> formatBtc
// ==========================================

describe('Integration: satsToBtc to formatBtc', () => {
  it('should convert and format correctly', () => {
    const sats = 50_000_000;
    const btc = satsToBtc(sats);
    const formatted = formatBtc(btc);

    // formatBtc uses minimumFractionDigits: 2
    expect(formatted).toBe('0.50');
  });

  it('should handle small sat amounts', () => {
    const sats = 10;
    const btc = satsToBtc(sats);
    const formatted = formatBtc(btc);

    expect(formatted).toBe('10 sats');
  });
});
