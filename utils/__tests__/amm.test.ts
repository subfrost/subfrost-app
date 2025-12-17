/**
 * AMM Utility Function Tests
 *
 * Tests for the AMM math functions in utils/amm.ts
 * These are pure functions that can be tested without providers or contexts.
 *
 * Run with: pnpm test utils/__tests__/amm.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  swapBuyAmount,
  swapSellAmount,
  applyWrapFee,
  applyUnwrapFee,
  calculateMinimumFromSlippageBigInt,
  calculateMaximumFromSlippageBigInt,
  calculateMinimumFromSlippage,
  calculateMaximumFromSlippage,
  assertAlkaneUtxosAreClean,
  getFutureBlockHeight,
} from '../amm';

// ==========================================
// swapBuyAmount Tests (Constant Product AMM)
// ==========================================

describe('swapBuyAmount', () => {
  const defaultReserves = {
    sellTokenReserve: 1_000_000_000_000n, // 10,000 tokens (8 decimals)
    buyTokenReserve: 1_000_000_000_000n,
    feeRate: 10n, // 1% fee
  };

  it('should calculate correct output for equal reserves', () => {
    const result = swapBuyAmount({
      sellAmount: 100_000_000n, // 1 token
      ...defaultReserves,
    });

    // Output should be less than input due to fee + price impact
    expect(result.buyAmount).toBeLessThan(100_000_000n);
    expect(result.buyAmount).toBeGreaterThan(0n);

    // Fee should be 1% of input
    expect(result.sellTokenFeeAmount).toBe(1_000_000n);
  });

  it('should calculate correct output for unequal reserves (2:1 ratio)', () => {
    const result = swapBuyAmount({
      sellAmount: 100_000_000n,
      sellTokenReserve: 1_000_000_000_000n,
      buyTokenReserve: 2_000_000_000_000n, // 2x more buy token
      feeRate: 10n,
    });

    // Output should be roughly 2x input minus fees and slippage
    expect(result.buyAmount).toBeGreaterThan(100_000_000n);
    expect(result.buyAmount).toBeLessThan(200_000_000n);
  });

  it('should throw error for zero sell amount', () => {
    expect(() =>
      swapBuyAmount({
        sellAmount: 0n,
        ...defaultReserves,
      })
    ).toThrow('Insufficient sell amount');
  });

  it('should throw error for negative sell amount', () => {
    expect(() =>
      swapBuyAmount({
        sellAmount: -1n,
        ...defaultReserves,
      })
    ).toThrow('Insufficient sell amount');
  });

  it('should throw error for zero sell token reserve', () => {
    expect(() =>
      swapBuyAmount({
        sellAmount: 100_000_000n,
        sellTokenReserve: 0n,
        buyTokenReserve: 1_000_000_000_000n,
        feeRate: 10n,
      })
    ).toThrow('Insufficient liquidity');
  });

  it('should throw error for zero buy token reserve', () => {
    expect(() =>
      swapBuyAmount({
        sellAmount: 100_000_000n,
        sellTokenReserve: 1_000_000_000_000n,
        buyTokenReserve: 0n,
        feeRate: 10n,
      })
    ).toThrow('Insufficient liquidity');
  });

  it('should apply zero fee correctly', () => {
    const result = swapBuyAmount({
      sellAmount: 100_000_000n,
      ...defaultReserves,
      feeRate: 0n,
    });

    expect(result.sellTokenFeeAmount).toBe(0n);
    // Output should be higher with no fee
    expect(result.buyAmount).toBeGreaterThan(0n);
  });

  it('should apply higher fee correctly', () => {
    const result1Percent = swapBuyAmount({
      sellAmount: 100_000_000n,
      ...defaultReserves,
      feeRate: 10n, // 1%
    });

    const result3Percent = swapBuyAmount({
      sellAmount: 100_000_000n,
      ...defaultReserves,
      feeRate: 30n, // 3%
    });

    // Higher fee should result in less output
    expect(result3Percent.buyAmount).toBeLessThan(result1Percent.buyAmount);
    expect(result3Percent.sellTokenFeeAmount).toBeGreaterThan(result1Percent.sellTokenFeeAmount);
  });

  it('should handle large numbers without overflow', () => {
    const result = swapBuyAmount({
      sellAmount: 1_000_000_000_000_000n, // Very large amount
      sellTokenReserve: 10_000_000_000_000_000n,
      buyTokenReserve: 10_000_000_000_000_000n,
      feeRate: 10n,
    });

    expect(result.buyAmount).toBeGreaterThan(0n);
  });
});

// ==========================================
// swapSellAmount Tests (Exact Output Swap)
// ==========================================

describe('swapSellAmount', () => {
  const defaultReserves = {
    sellTokenReserve: 1_000_000_000_000n,
    buyTokenReserve: 1_000_000_000_000n,
    feeRate: 10n,
  };

  it('should calculate correct input for exact output', () => {
    const input = swapSellAmount({
      buyAmount: 100_000_000n,
      ...defaultReserves,
    });

    // Input should be more than output (due to fees and price impact)
    expect(input).toBeGreaterThan(100_000_000n);
  });

  it('should throw error for zero buy amount', () => {
    expect(() =>
      swapSellAmount({
        buyAmount: 0n,
        ...defaultReserves,
      })
    ).toThrow('Insufficient buy amount');
  });

  it('should throw error for zero reserves', () => {
    expect(() =>
      swapSellAmount({
        buyAmount: 100_000_000n,
        sellTokenReserve: 0n,
        buyTokenReserve: 1_000_000_000_000n,
        feeRate: 10n,
      })
    ).toThrow('Insufficient liquidity');
  });

  it('should throw error when buy amount exceeds reserve', () => {
    expect(() =>
      swapSellAmount({
        buyAmount: 1_000_000_000_001n, // More than reserve
        sellTokenReserve: 1_000_000_000_000n,
        buyTokenReserve: 1_000_000_000_000n,
        feeRate: 10n,
      })
    ).toThrow('Insufficient liquidity for output');
  });

  it('should round up the result', () => {
    // The function should add +1 to round up
    const input = swapSellAmount({
      buyAmount: 1n, // Very small output
      ...defaultReserves,
    });

    expect(input).toBeGreaterThanOrEqual(1n);
  });
});

// ==========================================
// Wrap/Unwrap Fee Tests
// ==========================================

describe('applyWrapFee', () => {
  it('should apply 0.1% fee correctly', () => {
    const amount = 100_000_000n; // 1 BTC in sats
    const afterFee = applyWrapFee(amount, 1); // 0.1% = 1 per thousand

    expect(afterFee).toBe(99_900_000n);
    expect(amount - afterFee).toBe(100_000n); // 0.1% = 100,000 sats
  });

  it('should apply 0.2% fee correctly', () => {
    const amount = 100_000_000n;
    const afterFee = applyWrapFee(amount, 2);

    expect(afterFee).toBe(99_800_000n);
  });

  it('should apply 1% fee correctly', () => {
    const amount = 100_000_000n;
    const afterFee = applyWrapFee(amount, 10);

    expect(afterFee).toBe(99_000_000n);
  });

  it('should handle zero fee', () => {
    const amount = 100_000_000n;
    const afterFee = applyWrapFee(amount, 0);

    expect(afterFee).toBe(amount);
  });
});

describe('applyUnwrapFee', () => {
  it('should apply fee correctly', () => {
    const amount = 100_000_000n;
    const afterFee = applyUnwrapFee(amount, 1);

    expect(afterFee).toBe(99_900_000n);
  });

  it('should apply same formula as wrapFee', () => {
    const amount = 50_000_000n;
    const fee = 5;

    expect(applyUnwrapFee(amount, fee)).toBe(applyWrapFee(amount, fee));
  });
});

// ==========================================
// Slippage Calculation Tests (BigInt)
// ==========================================

describe('calculateMinimumFromSlippageBigInt', () => {
  it('should calculate minimum with 0.5% slippage', () => {
    const amount = 100_000_000n;
    const minimum = calculateMinimumFromSlippageBigInt(amount, 0.5);

    expect(minimum).toBe(99_500_000n);
  });

  it('should calculate minimum with 1% slippage', () => {
    const amount = 100_000_000n;
    const minimum = calculateMinimumFromSlippageBigInt(amount, 1.0);

    expect(minimum).toBe(99_000_000n);
  });

  it('should calculate minimum with 5% slippage', () => {
    const amount = 100_000_000n;
    const minimum = calculateMinimumFromSlippageBigInt(amount, 5.0);

    expect(minimum).toBe(95_000_000n);
  });

  it('should handle 0% slippage', () => {
    const amount = 100_000_000n;
    const minimum = calculateMinimumFromSlippageBigInt(amount, 0);

    expect(minimum).toBe(amount);
  });
});

describe('calculateMaximumFromSlippageBigInt', () => {
  it('should calculate maximum with 0.5% slippage', () => {
    const amount = 100_000_000n;
    const maximum = calculateMaximumFromSlippageBigInt(amount, 0.5);

    expect(maximum).toBe(100_500_000n);
  });

  it('should calculate maximum with 1% slippage', () => {
    const amount = 100_000_000n;
    const maximum = calculateMaximumFromSlippageBigInt(amount, 1.0);

    expect(maximum).toBe(101_000_000n);
  });

  it('should handle 0% slippage', () => {
    const amount = 100_000_000n;
    const maximum = calculateMaximumFromSlippageBigInt(amount, 0);

    expect(maximum).toBe(amount);
  });
});

// ==========================================
// Slippage Calculation Tests (String-based)
// ==========================================

describe('calculateMinimumFromSlippage (string-based)', () => {
  it('should calculate minimum with 0.5% slippage', () => {
    const minimum = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: 0.5,
    });

    expect(minimum).toBe('99500000');
  });

  it('should calculate minimum with string slippage', () => {
    const minimum = calculateMinimumFromSlippage({
      amount: '100000000',
      maxSlippage: '1',
    });

    expect(minimum).toBe('99000000');
  });

  it('should floor the result', () => {
    // Test with amount that would produce decimal
    const minimum = calculateMinimumFromSlippage({
      amount: '100',
      maxSlippage: 0.5,
    });

    // 100 * 0.995 = 99.5 -> floor to 99
    expect(minimum).toBe('99');
  });
});

describe('calculateMaximumFromSlippage (string-based)', () => {
  it('should calculate maximum with 0.5% slippage', () => {
    const maximum = calculateMaximumFromSlippage({
      amount: '100000000',
      maxSlippage: 0.5,
    });

    expect(maximum).toBe('100500000');
  });

  it('should ceil the result', () => {
    // Test with amount that would produce decimal
    const maximum = calculateMaximumFromSlippage({
      amount: '100',
      maxSlippage: 0.5,
    });

    // 100 * 1.005 = 100.5 -> ceil to 101
    expect(maximum).toBe('101');
  });
});

// ==========================================
// UTXO Validation Tests
// ==========================================

describe('assertAlkaneUtxosAreClean', () => {
  it('should pass for UTXOs without inscriptions or runes', () => {
    const cleanUtxos = [
      { address: 'bcrt1...', inscriptions: [], runes: [] },
      { address: 'bcrt1...', inscriptions: [], runes: {} },
    ];

    expect(() => assertAlkaneUtxosAreClean(cleanUtxos)).not.toThrow();
  });

  it('should throw for UTXOs with inscriptions', () => {
    const utxosWithInscriptions = [
      { address: 'bcrt1...', inscriptions: [{ id: 'abc123' }], runes: [] },
    ];

    expect(() => assertAlkaneUtxosAreClean(utxosWithInscriptions)).toThrow(
      'UTXO at index 0 contains Inscriptions or Runes'
    );
  });

  it('should throw for UTXOs with runes (array)', () => {
    const utxosWithRunes = [
      { address: 'bcrt1...', inscriptions: [], runes: [{ id: 'rune1' }] },
    ];

    expect(() => assertAlkaneUtxosAreClean(utxosWithRunes)).toThrow(
      'UTXO at index 0 contains Inscriptions or Runes'
    );
  });

  it('should throw for UTXOs with runes (object)', () => {
    const utxosWithRunes = [
      { address: 'bcrt1...', inscriptions: [], runes: { rune1: { amount: 100 } } },
    ];

    expect(() => assertAlkaneUtxosAreClean(utxosWithRunes)).toThrow(
      'UTXO at index 0 contains Inscriptions or Runes'
    );
  });

  it('should report correct index for offending UTXO', () => {
    const mixedUtxos = [
      { address: 'bcrt1...', inscriptions: [], runes: [] },
      { address: 'bcrt1...', inscriptions: [], runes: [] },
      { address: 'bcrt1...', inscriptions: [{ id: 'bad' }], runes: [] }, // Index 2
    ];

    expect(() => assertAlkaneUtxosAreClean(mixedUtxos)).toThrow(
      'UTXO at index 2 contains Inscriptions or Runes'
    );
  });

  it('should pass for empty array', () => {
    expect(() => assertAlkaneUtxosAreClean([])).not.toThrow();
  });
});

// ==========================================
// getFutureBlockHeight Tests
// ==========================================

describe('getFutureBlockHeight', () => {
  it('should return current height plus blocks using metashrewHeight', async () => {
    const mockProvider = {
      metashrewHeight: async () => 1000,
    };

    const result = await getFutureBlockHeight(10, mockProvider);
    expect(result).toBe(1010);
  });

  it('should return current height when blocks is 0', async () => {
    const mockProvider = {
      metashrewHeight: async () => 500,
    };

    const result = await getFutureBlockHeight(0, mockProvider);
    expect(result).toBe(500);
  });

  it('should use sandshrew.bitcoindRpc.getBlockCount as fallback', async () => {
    const mockProvider = {
      sandshrew: {
        bitcoindRpc: {
          getBlockCount: async () => 2000,
        },
      },
    };

    const result = await getFutureBlockHeight(5, mockProvider);
    expect(result).toBe(2005);
  });

  it('should use bitcoin.getBlockCount as fallback', async () => {
    const mockProvider = {
      bitcoin: {
        getBlockCount: async () => 3000,
      },
    };

    const result = await getFutureBlockHeight(15, mockProvider);
    expect(result).toBe(3015);
  });

  it('should throw error when no getBlockCount method available', async () => {
    const mockProvider = {};

    await expect(getFutureBlockHeight(10, mockProvider)).rejects.toThrow(
      'No getBlockCount method available on provider'
    );
  });
});
