/**
 * Bridge Quote Engine Tests
 */
import { describe, it, expect } from 'vitest';
import {
  quoteStableToBtc,
  quoteBtcToStable,
  formatAmount,
  computeStableSwap,
} from '../quoteEngine';

const MOCK_RESERVES = {
  frbtcReserve: 100_000_000n * 100n,     // 100 frBTC (8 decimals)
  frusdReserve: 10_000_000_000n * 10n ** 18n / 10n ** 10n, // ~10B frUSD equivalent
  feePerMille: 4, // 0.4% synth pool fee
};

// More realistic reserves for testing
const REALISTIC_RESERVES = {
  frbtcReserve: 217_000_000_00n,  // 217 frBTC
  frusdReserve: 21_700_000_000_000_000_000_000n, // 21.7T frUSD (matching ~$100K BTC)
  feePerMille: 4,
};

describe('Quote Engine', () => {
  describe('Stable → BTC', () => {
    it('should compute a valid quote', () => {
      const quote = quoteStableToBtc('USDT', 1000_000_000n, REALISTIC_RESERVES); // 1000 USDT
      expect(quote.direction).toBe('to-btc');
      expect(quote.inputToken).toBe('USDT');
      expect(quote.outputToken).toBe('BTC');
      expect(quote.finalOutput).toBeGreaterThan(0n);
      expect(quote.protocolFee).toBeGreaterThan(0n);
    });

    it('should apply 0.1% protocol fee', () => {
      const amount = 10000_000_000n; // 10,000 USDC
      const quote = quoteStableToBtc('USDC', amount, REALISTIC_RESERVES);
      // Fee = 10000 * 10 / 10000 = 10 USDC
      expect(quote.protocolFee).toBe(10_000_000n);
      expect(quote.netInputAfterFee).toBe(9990_000_000n);
    });

    it('should convert USDC 6-dec to frUSD 18-dec', () => {
      const quote = quoteStableToBtc('USDC', 1000_000_000n, REALISTIC_RESERVES);
      // 999 USDC * 10^12 = 999 * 10^18
      expect(quote.frUsdAmount).toBe(999_000_000n * 10n ** 12n);
    });

    it('should apply wrap fee on BTC output', () => {
      const quote = quoteStableToBtc('USDT', 1000_000_000n, REALISTIC_RESERVES);
      // frBTC output minus 0.5% wrap fee = final BTC
      const expectedWrapFee = (quote.synthPoolOutput * 5n) / 1000n;
      expect(quote.finalOutput).toBe(quote.synthPoolOutput - expectedWrapFee);
    });

    it('should have fee breakdown strings', () => {
      const quote = quoteStableToBtc('USDT', 1000_000_000n, REALISTIC_RESERVES);
      expect(quote.feeBreakdown.protocolFee).toContain('0.1%');
      expect(quote.feeBreakdown.wrapFee).toContain('0.5%');
      expect(quote.feeBreakdown.synthPoolFee).toContain('%');
    });

    it('should estimate 15 minutes', () => {
      const quote = quoteStableToBtc('USDT', 1000_000_000n, REALISTIC_RESERVES);
      expect(quote.estimatedTimeMinutes).toBe(15);
    });
  });

  describe('BTC → Stable', () => {
    it('should compute a valid quote', () => {
      const quote = quoteBtcToStable('USDT', 100_000_000n, REALISTIC_RESERVES); // 1 BTC
      expect(quote.direction).toBe('to-stable');
      expect(quote.inputToken).toBe('BTC');
      expect(quote.outputToken).toBe('USDT');
      expect(quote.finalOutput).toBeGreaterThan(0n);
    });

    it('should apply wrap fee on BTC input', () => {
      const btcAmount = 100_000_000n; // 1 BTC
      const quote = quoteBtcToStable('USDC', btcAmount, REALISTIC_RESERVES);
      const expectedWrapFee = (btcAmount * 5n) / 1000n;
      expect(quote.netInputAfterFee).toBe(btcAmount - expectedWrapFee);
    });

    it('should convert frUSD 18-dec back to stable 6-dec', () => {
      const quote = quoteBtcToStable('USDC', 100_000_000n, REALISTIC_RESERVES);
      // finalOutput should be in 6-decimal format
      expect(quote.finalOutput).toBeLessThan(10n ** 18n); // not 18-dec scale
    });

    it('should estimate 20 minutes (longer for BTC→stable)', () => {
      const quote = quoteBtcToStable('USDT', 100_000_000n, REALISTIC_RESERVES);
      expect(quote.estimatedTimeMinutes).toBe(20);
    });
  });

  describe('StableSwap Math', () => {
    it('should return 0 for empty reserves', () => {
      const result = computeStableSwap(1000n, 0n, 0n, 4);
      expect(result.amountOut).toBe(0n);
    });

    it('should apply fee', () => {
      const withFee = computeStableSwap(1000n, 100000n, 100000n, 10); // 1% fee
      const noFee = computeStableSwap(1000n, 100000n, 100000n, 0);
      expect(withFee.amountOut).toBeLessThan(noFee.amountOut);
    });

    it('should have higher price impact for larger trades', () => {
      const small = computeStableSwap(100n, 100000n, 100000n, 4);
      const large = computeStableSwap(50000n, 100000n, 100000n, 4);
      expect(large.priceImpact).toBeGreaterThan(small.priceImpact);
    });

    it('should never exceed reserve out', () => {
      const huge = computeStableSwap(999999999n, 100000n, 100000n, 0);
      expect(huge.amountOut).toBeLessThan(100000n);
    });
  });

  describe('Format Amount', () => {
    it('should format 6-decimal amounts', () => {
      expect(formatAmount(1_000_000n, 6)).toBe('1.0000');
      expect(formatAmount(1_500_000n, 6)).toBe('1.5000');
    });

    it('should format 8-decimal amounts', () => {
      expect(formatAmount(100_000_000n, 8)).toBe('1.0000');
    });

    it('should format zero', () => {
      expect(formatAmount(0n, 6)).toBe('0.0000');
    });

    it('should format large amounts', () => {
      expect(formatAmount(1_000_000_000_000n, 6)).toBe('1000000.0000');
    });
  });
});
