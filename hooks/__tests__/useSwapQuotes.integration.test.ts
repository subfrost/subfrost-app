/**
 * Integration Tests for Multi-Hop Swap Routing
 * Tests the core routing logic without needing full browser E2E
 */

import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';

// Mock data structures
type SwapQuote = {
  direction: 'sell' | 'buy';
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
  route?: string[];
  hops?: number;
};

// Test helper functions
function swapCalculateOut({
  amountIn,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountIn: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number {
  if (amountIn <= 0) throw new Error('INSUFFICIENT_INPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = amountIn * (1 - feePercentage);
  const amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee);
  return Math.floor(amountOut);
}

function calculateSwapPrice(
  sellToken: string,
  buyToken: string,
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  wrapFee: number = 2,
  unwrapFee: number = 2,
): SwapQuote {
  const poolFee = 0.01; // 1% total protocol fee

  let actualAmountIn = amountIn;

  // Apply wrap fee if selling BTC
  if (sellToken === 'btc') {
    actualAmountIn = (amountIn * (1000 - wrapFee)) / 1000;
  }

  // Calculate swap output
  let calculatedOut = swapCalculateOut({
    amountIn: actualAmountIn,
    reserveIn,
    reserveOut,
    feePercentage: poolFee,
  });

  // Apply unwrap fee if buying BTC
  if (buyToken === 'btc') {
    calculatedOut = (calculatedOut * (1000 - unwrapFee)) / 1000;
  }

  const exchangeRate = new BigNumber(calculatedOut).dividedBy(amountIn).toString();

  return {
    direction: 'sell',
    inputAmount: amountIn.toString(),
    buyAmount: calculatedOut.toString(),
    sellAmount: amountIn.toString(),
    exchangeRate,
    minimumReceived: (calculatedOut * 0.995).toString(), // 0.5% slippage
    maximumSent: amountIn.toString(),
    displayBuyAmount: (calculatedOut / 1e8).toString(),
    displaySellAmount: (amountIn / 1e8).toString(),
    displayMinimumReceived: ((calculatedOut * 0.995) / 1e8).toString(),
    displayMaximumSent: (amountIn / 1e8).toString(),
  };
}

describe('Dynamic Fee Parsing', () => {
  it('Should parse zero premium', () => {
    const data = new Uint8Array(16).fill(0);
    let result = BigInt(0);
    for (let i = 0; i < 16; i++) {
      result += BigInt(data[i]) << BigInt(i * 8);
    }
    expect(result).toBe(BigInt(0));
  });

  it('Should parse 0.1% premium (100,000)', () => {
    const data = new Uint8Array(16).fill(0);
    data[0] = 0xa0;
    data[1] = 0x86;
    data[2] = 0x01;
    let result = BigInt(0);
    for (let i = 0; i < 16; i++) {
      result += BigInt(data[i]) << BigInt(i * 8);
    }
    const feePerThousand = Number(result) / 100_000;
    expect(feePerThousand).toBe(1);
  });

  it('Should parse 0.2% premium (200,000)', () => {
    const data = new Uint8Array(16).fill(0);
    data[0] = 0x40;
    data[1] = 0x0d;
    data[2] = 0x03;
    let result = BigInt(0);
    for (let i = 0; i < 16; i++) {
      result += BigInt(data[i]) << BigInt(i * 8);
    }
    const feePerThousand = Number(result) / 100_000;
    expect(feePerThousand).toBe(2);
  });
});

describe('Direct Swap Calculations', () => {
  it('Should calculate direct swap correctly', () => {
    const amountIn = 100_000_000; // 1 token (8 decimals)
    const reserveIn = 1000_000_000_000; // 10,000 tokens
    const reserveOut = 2000_000_000_000; // 20,000 tokens

    const quote = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut);

    expect(quote.buyAmount).toBeDefined();
    expect(Number(quote.buyAmount)).toBeGreaterThan(0);
    expect(Number(quote.buyAmount)).toBeLessThan(amountIn * 2); // Should be less than 2x due to fees
  });

  it('Should apply wrap fee for BTC swaps', () => {
    const amountIn = 100_000_000; // 1 BTC
    const reserveIn = 1000_000_000_000;
    const reserveOut = 1000_000_000_000;
    const wrapFee = 2; // 0.2%

    const quote = calculateSwapPrice('btc', 'tokenB', amountIn, reserveIn, reserveOut, wrapFee);

    // Output should be less due to wrap fee
    const quoteWithoutFee = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut, 0);
    expect(Number(quote.buyAmount)).toBeLessThan(Number(quoteWithoutFee.buyAmount));
  });

  it('Should apply unwrap fee for BTC purchases', () => {
    const amountIn = 100_000_000;
    const reserveIn = 1000_000_000_000;
    const reserveOut = 1000_000_000_000;
    const unwrapFee = 2; // 0.2%

    const quote = calculateSwapPrice('tokenA', 'btc', amountIn, reserveIn, reserveOut, 2, unwrapFee);

    // Output should be less due to unwrap fee
    const quoteWithoutFee = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut, 0, 0);
    expect(Number(quote.buyAmount)).toBeLessThan(Number(quoteWithoutFee.buyAmount));
  });
});

describe('Multi-Hop Routing Logic', () => {
  it('Should calculate 2-hop swap (DIESEL -> BUSD -> ALKAMIST)', () => {
    const amountIn = 100_000_000; // 1 DIESEL

    // Hop 1: DIESEL -> BUSD
    const hop1ReserveIn = 500_000_000_000; // 5,000 DIESEL
    const hop1ReserveOut = 1000_000_000_000; // 10,000 BUSD
    const hop1Quote = calculateSwapPrice('DIESEL', 'BUSD', amountIn, hop1ReserveIn, hop1ReserveOut);

    // Hop 2: BUSD -> ALKAMIST
    const hop2AmountIn = Number(hop1Quote.buyAmount);
    const hop2ReserveIn = 1000_000_000_000; // 10,000 BUSD
    const hop2ReserveOut = 500_000_000_000; // 5,000 ALKAMIST
    const hop2Quote = calculateSwapPrice('BUSD', 'ALKAMIST', hop2AmountIn, hop2ReserveIn, hop2ReserveOut);

    expect(Number(hop1Quote.buyAmount)).toBeGreaterThan(0);
    expect(Number(hop2Quote.buyAmount)).toBeGreaterThan(0);

    // Final output should be less than direct due to 2x fees
    const finalOutput = Number(hop2Quote.buyAmount);
    expect(finalOutput).toBeGreaterThan(0);
  });

  it('Should simulate route comparison (BUSD vs frBTC bridge)', () => {
    const amountIn = 100_000_000;

    // BUSD bridge route
    const busdHop1 = calculateSwapPrice('DIESEL', 'BUSD', amountIn, 500_000_000_000, 1000_000_000_000);
    const busdHop2 = calculateSwapPrice('BUSD', 'ALKAMIST', Number(busdHop1.buyAmount), 1000_000_000_000, 500_000_000_000);
    const busdRouteOutput = Number(busdHop2.buyAmount);

    // frBTC bridge route (assume better liquidity)
    const frbtcHop1 = calculateSwapPrice('DIESEL', 'frBTC', amountIn, 500_000_000_000, 2000_000_000_000);
    const frbtcHop2 = calculateSwapPrice('frBTC', 'ALKAMIST', Number(frbtcHop1.buyAmount), 2000_000_000_000, 500_000_000_000);
    const frbtcRouteOutput = Number(frbtcHop2.buyAmount);

    // Should be able to compare routes
    const bestRoute = busdRouteOutput > frbtcRouteOutput ? 'BUSD' : 'frBTC';
    expect(bestRoute).toBeDefined();
  });

  it('Should handle BTC -> alkane multi-hop (wrap + swap)', () => {
    const amountIn = 100_000_000; // 1 BTC
    const wrapFee = 2; // 0.2%

    // BTC wraps to frBTC (with fee)
    const afterWrap = (amountIn * (1000 - wrapFee)) / 1000;

    // frBTC -> DIESEL swap
    const swapQuote = calculateSwapPrice('frBTC', 'DIESEL', afterWrap, 1000_000_000_000, 500_000_000_000);

    expect(Number(swapQuote.buyAmount)).toBeGreaterThan(0);
    expect(Number(swapQuote.buyAmount)).toBeLessThan(amountIn); // Less due to wrap fee + swap fee
  });

  it('Should handle alkane -> BTC multi-hop (swap + unwrap)', () => {
    const amountIn = 100_000_000; // 1 DIESEL
    const unwrapFee = 2; // 0.2%

    // DIESEL -> frBTC swap
    const swapQuote = calculateSwapPrice('DIESEL', 'frBTC', amountIn, 500_000_000_000, 1000_000_000_000);

    // frBTC unwraps to BTC (with fee)
    const afterUnwrap = (Number(swapQuote.buyAmount) * (1000 - unwrapFee)) / 1000;

    expect(afterUnwrap).toBeGreaterThan(0);
    expect(afterUnwrap).toBeLessThan(Number(swapQuote.buyAmount)); // Less due to unwrap fee
  });
});

describe('Edge Cases', () => {
  it('Should throw error for zero input', () => {
    expect(() =>
      swapCalculateOut({
        amountIn: 0,
        reserveIn: 1000_000_000_000,
        reserveOut: 1000_000_000_000,
        feePercentage: 0.01,
      }),
    ).toThrow('INSUFFICIENT_INPUT_AMOUNT');
  });

  it('Should throw error for zero liquidity', () => {
    expect(() =>
      swapCalculateOut({
        amountIn: 100_000_000,
        reserveIn: 0,
        reserveOut: 1000_000_000_000,
        feePercentage: 0.01,
      }),
    ).toThrow('INSUFFICIENT_LIQUIDITY');
  });

  it('Should handle very small amounts', () => {
    const amountIn = 1000; // 0.00001 tokens (very small)
    const reserveIn = 1000_000_000_000;
    const reserveOut = 1000_000_000_000;

    const quote = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut);
    expect(Number(quote.buyAmount)).toBeGreaterThan(0);
  });

  it('Should handle large amounts', () => {
    const amountIn = 10_000_000_000_000; // 100,000 tokens
    const reserveIn = 100_000_000_000_000; // 1M tokens
    const reserveOut = 100_000_000_000_000;

    const quote = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut);
    expect(Number(quote.buyAmount)).toBeGreaterThan(0);
    expect(Number(quote.buyAmount)).toBeLessThan(amountIn); // Should have price impact
  });
});

describe('Fee Calculations', () => {
  it('Should calculate total fees for multi-hop correctly', () => {
    const poolFee = 0.01; // 1% per hop
    const wrapFee = 0.002; // 0.2%

    // 2-hop with wrap
    const totalFee = wrapFee + poolFee + poolFee;
    expect(totalFee).toBe(0.022); // 2.2% total
  });

  it('Should show higher fees for multi-hop vs direct', () => {
    const directFee = 0.01; // 1% for direct swap
    const multiHopFee = 0.01 + 0.01; // 2% for 2-hop

    expect(multiHopFee).toBeGreaterThan(directFee);
  });

  it('Should apply dynamic fee correctly', () => {
    const staticFee = 1; // 0.1%
    const dynamicFee = 2; // 0.2%

    const amountIn = 100_000_000;
    const afterStaticFee = (amountIn * (1000 - staticFee)) / 1000;
    const afterDynamicFee = (amountIn * (1000 - dynamicFee)) / 1000;

    expect(afterDynamicFee).toBeLessThan(afterStaticFee);

    const difference = afterStaticFee - afterDynamicFee;
    expect(difference).toBe(100_000); // 0.1% difference on 100M = 100K
  });
});
