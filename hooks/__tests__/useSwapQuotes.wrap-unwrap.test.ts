/**
 * Unit tests for direct BTC↔frBTC wrap/unwrap quote math
 */

import BigNumber from 'bignumber.js';

function toAlks(amount: string): string {
  return new BigNumber(amount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR).toString();
}

function fromAlks(alks: string): string {
  return new BigNumber(alks).dividedBy(1e8).toFixed(8);
}

// Simulate the short-circuit logic used in useSwapQuotes for wrap/unwrap
function simulateWrapQuote({ amount, direction, wrapFeePerThousand }: { amount: string; direction: 'sell' | 'buy'; wrapFeePerThousand: number }) {
  const inAlks = Number(toAlks(amount));
  if (direction === 'sell') {
    const out = Math.floor((inAlks * (1000 - wrapFeePerThousand)) / 1000);
    return {
      buyAmount: String(out),
      sellAmount: String(inAlks),
      displayBuyAmount: fromAlks(String(out)),
      displaySellAmount: fromAlks(String(inAlks)),
      route: ['wrap'],
      hops: 0,
    } as any;
  } else {
    const requiredIn = Math.ceil((inAlks * 1000) / (1000 - wrapFeePerThousand));
    return {
      buyAmount: String(inAlks),
      sellAmount: String(requiredIn),
      displayBuyAmount: fromAlks(String(inAlks)),
      displaySellAmount: fromAlks(String(requiredIn)),
      route: ['wrap'],
      hops: 0,
    } as any;
  }
}

function simulateUnwrapQuote({ amount, direction, unwrapFeePerThousand }: { amount: string; direction: 'sell' | 'buy'; unwrapFeePerThousand: number }) {
  const inAlks = Number(toAlks(amount));
  if (direction === 'sell') {
    const out = Math.floor((inAlks * (1000 - unwrapFeePerThousand)) / 1000);
    return {
      buyAmount: String(out),
      sellAmount: String(inAlks),
      displayBuyAmount: fromAlks(String(out)),
      displaySellAmount: fromAlks(String(inAlks)),
      route: ['unwrap'],
      hops: 0,
    } as any;
  } else {
    const requiredIn = Math.ceil((inAlks * 1000) / (1000 - unwrapFeePerThousand));
    return {
      buyAmount: String(inAlks),
      sellAmount: String(requiredIn),
      displayBuyAmount: fromAlks(String(inAlks)),
      displaySellAmount: fromAlks(String(requiredIn)),
      route: ['unwrap'],
      hops: 0,
    } as any;
  }
}

console.log('🧪 Running wrap/unwrap short-circuit tests');

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toBeGreaterThan(expected: number) {
      if (!(Number(actual) > expected)) throw new Error(`Expected ${actual} > ${expected}`);
    },
    toBeLessThan(expected: number) {
      if (!(Number(actual) < expected)) throw new Error(`Expected ${actual} < ${expected}`);
    },
    toHaveLength(expected: number) {
      if (!actual || actual.length !== expected) throw new Error(`Expected length ${expected}, got ${actual?.length}`);
    },
  };
}

// Wrap: BTC -> frBTC (sell 0.5 BTC)
{
  const quote = simulateWrapQuote({ amount: '0.5', direction: 'sell', wrapFeePerThousand: 2 });
  expect(quote.route[0]).toBe('wrap');
  expect(quote.hops).toBe(0);
  // Expect output slightly less than input due to wrap fee
  expect(Number(quote.buyAmount)).toBeLessThan(Number(quote.sellAmount));
}

// Wrap: BTC -> frBTC (buy 0.5 frBTC)
{
  const quote = simulateWrapQuote({ amount: '0.5', direction: 'buy', wrapFeePerThousand: 2 });
  expect(quote.route[0]).toBe('wrap');
  expect(quote.hops).toBe(0);
  // Expect required input slightly greater than desired output
  expect(Number(quote.sellAmount)).toBeGreaterThan(Number(toAlks('0.5')));
}

// Unwrap: frBTC -> BTC (sell 1 frBTC)
{
  const quote = simulateUnwrapQuote({ amount: '1', direction: 'sell', unwrapFeePerThousand: 2 });
  expect(quote.route[0]).toBe('unwrap');
  expect(quote.hops).toBe(0);
  expect(Number(quote.buyAmount)).toBeLessThan(Number(quote.sellAmount));
}

// Unwrap: frBTC -> BTC (buy 1 BTC)
{
  const quote = simulateUnwrapQuote({ amount: '1', direction: 'buy', unwrapFeePerThousand: 2 });
  expect(quote.route[0]).toBe('unwrap');
  expect(quote.hops).toBe(0);
  expect(Number(quote.sellAmount)).toBeGreaterThan(Number(toAlks('1')));
}

console.log('✅ Wrap/unwrap tests completed\n');
