/**
 * useSwapQuotes Hook Calculation Tests
 *
 * Tests for the swap quote calculation functions used in useSwapQuotes hook.
 * These test the AMM math, fee calculations, and slippage handling.
 *
 * Run with: pnpm test hooks/__tests__/useSwapQuotes.vitest.test.ts
 */

import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';

// ==========================================
// Type Definitions
// ==========================================

type Direction = 'buy' | 'sell';

type SwapQuote = {
  direction: Direction;
  inputAmount: string;
  buyAmount: string;
  sellAmount: string;
  exchangeRate: string;
  minimumReceived: string;
  maximumSent: string;
  displayBuyAmount: string;
  displaySellAmount: string;
  displayMinimumReceived: string;
  displayMaximumSent: string;
  error?: string;
  route?: string[];
  hops?: number;
};

// ==========================================
// Helper Functions (extracted from useSwapQuotes)
// ==========================================

const ALKS_DECIMALS = 8;

/**
 * Convert display amount to alks (smallest unit)
 */
const toAlks = (amount: string): string => {
  if (!amount) return '0';
  return new BigNumber(amount)
    .multipliedBy(new BigNumber(10).pow(ALKS_DECIMALS))
    .integerValue(BigNumber.ROUND_FLOOR)
    .toString();
};

/**
 * Convert alks to display amount
 */
const fromAlks = (alks: string, displayPlaces = 8): string => {
  if (!alks) return '0';
  return new BigNumber(alks)
    .dividedBy(new BigNumber(10).pow(ALKS_DECIMALS))
    .toFixed(displayPlaces);
};

/**
 * Calculate output amount for exact input swap (constant product AMM)
 */
const swapCalculateOut = ({
  amountIn,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountIn: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number => {
  if (amountIn <= 0) throw new Error('INSUFFICIENT_INPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = amountIn * (1 - feePercentage);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return Math.floor(numerator / denominator);
};

/**
 * Calculate input amount for exact output swap
 */
const swapCalculateIn = ({
  amountOut,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountOut: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number => {
  if (amountOut <= 0) throw new Error('INSUFFICIENT_OUTPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  if (amountOut >= reserveOut) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = (amountOut * reserveIn) / (reserveOut - amountOut);
  const amountIn = amountInWithFee / (1 - feePercentage);
  return Math.ceil(amountIn);
};

/**
 * Calculate minimum received with slippage
 */
function calculateMinimumFromSlippage(params: { amount: string; maxSlippage: string }): string {
  const { amount, maxSlippage } = params;
  const slippageMultiplier = new BigNumber(1).minus(new BigNumber(maxSlippage).dividedBy(100));
  return new BigNumber(amount).multipliedBy(slippageMultiplier).integerValue(BigNumber.ROUND_FLOOR).toString();
}

/**
 * Calculate maximum sent with slippage
 */
function calculateMaximumFromSlippage(params: { amount: string; maxSlippage: string }): string {
  const { amount, maxSlippage } = params;
  const slippageMultiplier = new BigNumber(1).plus(new BigNumber(maxSlippage).dividedBy(100));
  return new BigNumber(amount).multipliedBy(slippageMultiplier).integerValue(BigNumber.ROUND_CEIL).toString();
}

// ==========================================
// Unit Conversion Tests
// ==========================================

describe('Unit Conversion Functions', () => {
  describe('toAlks', () => {
    it('should convert 1 BTC to 100000000 alks', () => {
      expect(toAlks('1')).toBe('100000000');
    });

    it('should convert 0.5 BTC to 50000000 alks', () => {
      expect(toAlks('0.5')).toBe('50000000');
    });

    it('should convert 0.00000001 BTC to 1 alk', () => {
      expect(toAlks('0.00000001')).toBe('1');
    });

    it('should handle empty string', () => {
      expect(toAlks('')).toBe('0');
    });

    it('should handle zero', () => {
      expect(toAlks('0')).toBe('0');
    });

    it('should floor fractional alks', () => {
      // 0.000000005 BTC = 0.5 alks, should floor to 0
      expect(toAlks('0.000000005')).toBe('0');
    });

    it('should handle large amounts', () => {
      expect(toAlks('21000000')).toBe('2100000000000000');
    });
  });

  describe('fromAlks', () => {
    it('should convert 100000000 alks to 1.00000000 BTC', () => {
      expect(fromAlks('100000000')).toBe('1.00000000');
    });

    it('should convert 50000000 alks to 0.50000000 BTC', () => {
      expect(fromAlks('50000000')).toBe('0.50000000');
    });

    it('should convert 1 alk to 0.00000001 BTC', () => {
      expect(fromAlks('1')).toBe('0.00000001');
    });

    it('should handle empty string', () => {
      expect(fromAlks('')).toBe('0');
    });

    it('should handle zero', () => {
      expect(fromAlks('0')).toBe('0.00000000');
    });

    it('should respect custom display places', () => {
      expect(fromAlks('100000000', 2)).toBe('1.00');
      expect(fromAlks('50000000', 4)).toBe('0.5000');
    });
  });

  describe('round-trip conversion', () => {
    it('should round-trip correctly for whole numbers', () => {
      const original = '1.5';
      const alks = toAlks(original);
      const back = fromAlks(alks);
      expect(back).toBe('1.50000000');
    });

    it('should round-trip correctly for small amounts', () => {
      const original = '0.00000001';
      const alks = toAlks(original);
      const back = fromAlks(alks);
      expect(back).toBe('0.00000001');
    });
  });
});

// ==========================================
// AMM Calculation Tests
// ==========================================

describe('swapCalculateOut', () => {
  const POOL_FEE = 0.01; // 1%

  describe('basic calculations', () => {
    it('should calculate correct output for equal reserves', () => {
      const result = swapCalculateOut({
        amountIn: 100_000_000, // 1 token
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: POOL_FEE,
      });

      // Output should be less than input due to fee and price impact
      expect(result).toBeLessThan(100_000_000);
      expect(result).toBeGreaterThan(0);
    });

    it('should calculate correct output for unequal reserves (2:1)', () => {
      const result = swapCalculateOut({
        amountIn: 100_000_000,
        reserveIn: 1_000_000_000_000,
        reserveOut: 2_000_000_000_000, // 2x output reserve
        feePercentage: POOL_FEE,
      });

      // Output should be roughly 2x input minus fees
      expect(result).toBeGreaterThan(100_000_000);
      expect(result).toBeLessThan(200_000_000);
    });

    it('should produce lower output with higher fee', () => {
      const with1Percent = swapCalculateOut({
        amountIn: 100_000_000,
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: 0.01,
      });

      const with3Percent = swapCalculateOut({
        amountIn: 100_000_000,
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: 0.03,
      });

      expect(with3Percent).toBeLessThan(with1Percent);
    });
  });

  describe('error handling', () => {
    it('should throw for zero input amount', () => {
      expect(() =>
        swapCalculateOut({
          amountIn: 0,
          reserveIn: 1_000_000_000_000,
          reserveOut: 1_000_000_000_000,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_INPUT_AMOUNT');
    });

    it('should throw for negative input amount', () => {
      expect(() =>
        swapCalculateOut({
          amountIn: -100,
          reserveIn: 1_000_000_000_000,
          reserveOut: 1_000_000_000_000,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_INPUT_AMOUNT');
    });

    it('should throw for zero reserve in', () => {
      expect(() =>
        swapCalculateOut({
          amountIn: 100_000_000,
          reserveIn: 0,
          reserveOut: 1_000_000_000_000,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_LIQUIDITY');
    });

    it('should throw for zero reserve out', () => {
      expect(() =>
        swapCalculateOut({
          amountIn: 100_000_000,
          reserveIn: 1_000_000_000_000,
          reserveOut: 0,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_LIQUIDITY');
    });
  });

  describe('price impact', () => {
    it('should show increasing price impact for larger trades', () => {
      const reserves = {
        reserveIn: 100_000_000_000, // 1000 tokens
        reserveOut: 100_000_000_000,
        feePercentage: POOL_FEE,
      };

      // Small trade (0.1% of reserve)
      const smallOut = swapCalculateOut({ ...reserves, amountIn: 100_000_000 });
      const smallRate = smallOut / 100_000_000;

      // Medium trade (1% of reserve)
      const mediumOut = swapCalculateOut({ ...reserves, amountIn: 1_000_000_000 });
      const mediumRate = mediumOut / 1_000_000_000;

      // Large trade (10% of reserve)
      const largeOut = swapCalculateOut({ ...reserves, amountIn: 10_000_000_000 });
      const largeRate = largeOut / 10_000_000_000;

      // Rate should decrease as trade size increases
      expect(mediumRate).toBeLessThan(smallRate);
      expect(largeRate).toBeLessThan(mediumRate);
    });
  });
});

describe('swapCalculateIn', () => {
  const POOL_FEE = 0.01;

  describe('basic calculations', () => {
    it('should calculate correct input for exact output', () => {
      const result = swapCalculateIn({
        amountOut: 100_000_000,
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: POOL_FEE,
      });

      // Input should be more than output due to fee
      expect(result).toBeGreaterThan(100_000_000);
    });

    it('should require more input with higher fee', () => {
      const with1Percent = swapCalculateIn({
        amountOut: 100_000_000,
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: 0.01,
      });

      const with3Percent = swapCalculateIn({
        amountOut: 100_000_000,
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: 0.03,
      });

      expect(with3Percent).toBeGreaterThan(with1Percent);
    });
  });

  describe('error handling', () => {
    it('should throw for zero output amount', () => {
      expect(() =>
        swapCalculateIn({
          amountOut: 0,
          reserveIn: 1_000_000_000_000,
          reserveOut: 1_000_000_000_000,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_OUTPUT_AMOUNT');
    });

    it('should throw for output amount >= reserve', () => {
      expect(() =>
        swapCalculateIn({
          amountOut: 1_000_000_000_001, // More than reserve
          reserveIn: 1_000_000_000_000,
          reserveOut: 1_000_000_000_000,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_LIQUIDITY');
    });

    it('should throw for output amount equal to reserve', () => {
      expect(() =>
        swapCalculateIn({
          amountOut: 1_000_000_000_000, // Exactly equal to reserve
          reserveIn: 1_000_000_000_000,
          reserveOut: 1_000_000_000_000,
          feePercentage: POOL_FEE,
        })
      ).toThrow('INSUFFICIENT_LIQUIDITY');
    });
  });

  describe('inverse relationship with swapCalculateOut', () => {
    it('should produce consistent results with swapCalculateOut', () => {
      const reserves = {
        reserveIn: 1_000_000_000_000,
        reserveOut: 1_000_000_000_000,
        feePercentage: POOL_FEE,
      };

      // Calculate output for a given input
      const inputAmount = 100_000_000;
      const outputFromInput = swapCalculateOut({ ...reserves, amountIn: inputAmount });

      // Calculate input needed for that output
      const inputForOutput = swapCalculateIn({ ...reserves, amountOut: outputFromInput });

      // Due to rounding, inputForOutput might be slightly different
      // but should be close to original input
      expect(Math.abs(inputForOutput - inputAmount)).toBeLessThan(100); // Within 100 units
    });
  });
});

// ==========================================
// Slippage Calculation Tests
// ==========================================

describe('calculateMinimumFromSlippage', () => {
  it('should calculate 0.5% slippage correctly', () => {
    const result = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: '0.5',
    });
    expect(result).toBe('99500000');
  });

  it('should calculate 1% slippage correctly', () => {
    const result = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: '1',
    });
    expect(result).toBe('99000000');
  });

  it('should calculate 5% slippage correctly', () => {
    const result = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: '5',
    });
    expect(result).toBe('95000000');
  });

  it('should floor fractional results', () => {
    const result = calculateMinimumFromSlippage({
      amount: '100000001',
      maxSlippage: '0.5',
    });
    // 100000001 * 0.995 = 99500000.995, should floor to 99500000
    expect(result).toBe('99500000');
  });

  it('should handle zero slippage', () => {
    const result = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: '0',
    });
    expect(result).toBe('100000000');
  });

  it('should handle 100% slippage', () => {
    const result = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: '100',
    });
    expect(result).toBe('0');
  });
});

describe('calculateMaximumFromSlippage', () => {
  it('should calculate 0.5% slippage correctly', () => {
    const result = calculateMaximumFromSlippage({
      amount: '100000000',
      maxSlippage: '0.5',
    });
    expect(result).toBe('100500000');
  });

  it('should calculate 1% slippage correctly', () => {
    const result = calculateMaximumFromSlippage({
      amount: '100000000',
      maxSlippage: '1',
    });
    expect(result).toBe('101000000');
  });

  it('should calculate 5% slippage correctly', () => {
    const result = calculateMaximumFromSlippage({
      amount: '100000000',
      maxSlippage: '5',
    });
    expect(result).toBe('105000000');
  });

  it('should ceil fractional results', () => {
    const result = calculateMaximumFromSlippage({
      amount: '100000001',
      maxSlippage: '0.5',
    });
    // 100000001 * 1.005 = 100500001.005, should ceil to 100500002
    expect(result).toBe('100500002');
  });

  it('should handle zero slippage', () => {
    const result = calculateMaximumFromSlippage({
      amount: '100000000',
      maxSlippage: '0',
    });
    expect(result).toBe('100000000');
  });
});

// ==========================================
// Wrap/Unwrap Fee Calculations
// ==========================================

describe('Wrap/Unwrap Fee Calculations', () => {
  const WRAP_FEE_PER_1000 = 1; // 0.1%
  const UNWRAP_FEE_PER_1000 = 2; // 0.2%

  describe('wrap fee (BTC -> frBTC)', () => {
    it('should calculate wrap fee correctly', () => {
      const btcAmount = 100_000_000; // 1 BTC
      const frbtcAmount = (btcAmount * (1000 - WRAP_FEE_PER_1000)) / 1000;

      expect(frbtcAmount).toBe(99_900_000); // 0.999 frBTC
    });

    it('should calculate wrap fee for large amounts', () => {
      // 21M BTC in satoshis (21M * 10^8)
      const btcAmount = 21_000_000 * 100_000_000; // 2,100,000,000,000,000
      const frbtcAmount = Math.floor((btcAmount * (1000 - WRAP_FEE_PER_1000)) / 1000);

      // 2,100,000,000,000,000 * 999 / 1000 = 2,097,900,000,000,000
      expect(frbtcAmount).toBe(2097900000000000);
    });
  });

  describe('unwrap fee (frBTC -> BTC)', () => {
    it('should calculate unwrap fee correctly', () => {
      const frbtcAmount = 100_000_000; // 1 frBTC
      const btcAmount = (frbtcAmount * (1000 - UNWRAP_FEE_PER_1000)) / 1000;

      expect(btcAmount).toBe(99_800_000); // 0.998 BTC
    });

    it('should handle different fee rates', () => {
      const frbtcAmount = 100_000_000;
      const fee3Per1000 = (frbtcAmount * (1000 - 3)) / 1000;

      expect(fee3Per1000).toBe(99_700_000); // 0.3% fee
    });
  });

  describe('round-trip wrap + unwrap', () => {
    it('should show total fee for round-trip', () => {
      const initialBtc = 100_000_000;

      // Wrap: BTC -> frBTC
      const afterWrap = Math.floor((initialBtc * (1000 - WRAP_FEE_PER_1000)) / 1000);

      // Unwrap: frBTC -> BTC
      const afterUnwrap = Math.floor((afterWrap * (1000 - UNWRAP_FEE_PER_1000)) / 1000);

      // Total fee should be approximately 0.3% (0.1% + 0.2%)
      const totalFee = initialBtc - afterUnwrap;
      const feePercent = (totalFee / initialBtc) * 100;

      expect(feePercent).toBeCloseTo(0.3, 1);
    });
  });
});

// ==========================================
// Direct Wrap/Unwrap Quote Calculation
// ==========================================

describe('Direct Wrap/Unwrap Quotes', () => {
  const WRAP_FEE = 1; // 0.1%
  const UNWRAP_FEE = 2; // 0.2%

  describe('direct wrap (BTC -> frBTC)', () => {
    it('should calculate sell direction correctly', () => {
      const inputBtc = '1'; // 1 BTC
      const inputAlks = toAlks(inputBtc);
      const outputAlks = Math.floor((Number(inputAlks) * (1000 - WRAP_FEE)) / 1000);

      expect(Number(inputAlks)).toBe(100_000_000);
      expect(outputAlks).toBe(99_900_000);
    });

    it('should calculate buy direction correctly', () => {
      const outputFrbtc = '1'; // Want 1 frBTC
      const outputAlks = toAlks(outputFrbtc);
      const requiredInputAlks = Math.ceil((Number(outputAlks) * 1000) / (1000 - WRAP_FEE));

      // Need slightly more than 1 BTC to get 1 frBTC after fee
      expect(requiredInputAlks).toBeGreaterThan(100_000_000);
      expect(requiredInputAlks).toBe(100100101); // ~1.001 BTC
    });
  });

  describe('direct unwrap (frBTC -> BTC)', () => {
    it('should calculate sell direction correctly', () => {
      const inputFrbtc = '1'; // 1 frBTC
      const inputAlks = toAlks(inputFrbtc);
      const outputAlks = Math.floor((Number(inputAlks) * (1000 - UNWRAP_FEE)) / 1000);

      expect(Number(inputAlks)).toBe(100_000_000);
      expect(outputAlks).toBe(99_800_000); // 0.998 BTC
    });

    it('should calculate buy direction correctly', () => {
      const outputBtc = '1'; // Want 1 BTC
      const outputAlks = toAlks(outputBtc);
      const requiredInputAlks = Math.ceil((Number(outputAlks) * 1000) / (1000 - UNWRAP_FEE));

      // Need slightly more than 1 frBTC to get 1 BTC after fee
      expect(requiredInputAlks).toBeGreaterThan(100_000_000);
      expect(requiredInputAlks).toBe(100200401); // ~1.002 frBTC
    });
  });
});

// ==========================================
// Integration: Complete Quote Flow
// ==========================================

describe('Integration: Complete Quote Calculation', () => {
  const POOL_FEE = 0.01; // 1%
  const WRAP_FEE = 1;
  const UNWRAP_FEE = 2;

  type MockPool = {
    token0Reserve: number;
    token1Reserve: number;
    feePercentage: number;
  };

  function calculateBtcToDieselQuote(
    btcAmount: string,
    pool: MockPool,
    maxSlippage: string
  ): Partial<SwapQuote> {
    const inputAlks = toAlks(btcAmount);

    // Step 1: Apply wrap fee (BTC -> frBTC)
    const afterWrap = Math.floor((Number(inputAlks) * (1000 - WRAP_FEE)) / 1000);

    // Step 2: Swap frBTC -> DIESEL
    const dieselOutput = swapCalculateOut({
      amountIn: afterWrap,
      reserveIn: pool.token0Reserve, // frBTC reserve
      reserveOut: pool.token1Reserve, // DIESEL reserve
      feePercentage: pool.feePercentage,
    });

    // Calculate slippage
    const minimumReceived = calculateMinimumFromSlippage({
      amount: dieselOutput.toString(),
      maxSlippage,
    });

    return {
      direction: 'sell',
      inputAmount: btcAmount,
      sellAmount: inputAlks,
      buyAmount: dieselOutput.toString(),
      minimumReceived,
      displayBuyAmount: fromAlks(dieselOutput.toString()),
      displayMinimumReceived: fromAlks(minimumReceived),
    };
  }

  it('should calculate complete BTC -> DIESEL quote', () => {
    const pool: MockPool = {
      token0Reserve: 50_000, // frBTC reserve (0.0005)
      token1Reserve: 300_000_000, // DIESEL reserve (3)
      feePercentage: POOL_FEE,
    };

    const quote = calculateBtcToDieselQuote('0.00001', pool, '0.5');

    expect(quote.direction).toBe('sell');
    expect(quote.inputAmount).toBe('0.00001');
    expect(Number(quote.sellAmount)).toBe(1000); // 0.00001 BTC in alks
    expect(Number(quote.buyAmount)).toBeGreaterThan(0);
    expect(Number(quote.minimumReceived)).toBeLessThan(Number(quote.buyAmount));
  });

  it('should show impact of slippage setting', () => {
    const pool: MockPool = {
      token0Reserve: 50_000,
      token1Reserve: 300_000_000,
      feePercentage: POOL_FEE,
    };

    const quote05 = calculateBtcToDieselQuote('0.00001', pool, '0.5');
    const quote1 = calculateBtcToDieselQuote('0.00001', pool, '1');

    // Same buy amount
    expect(quote05.buyAmount).toBe(quote1.buyAmount);

    // But different minimum received
    expect(Number(quote05.minimumReceived)).toBeGreaterThan(Number(quote1.minimumReceived));
  });
});
