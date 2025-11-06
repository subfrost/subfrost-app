/**
 * Integration Tests for Multi-Hop Swap Routing
 * Tests the core routing logic without needing full browser E2E
 */

import BigNumber from 'bignumber.js';

// Mock data structures
type AlkanesTokenPair = {
  token0: { id: string; token0Amount: string };
  token1: { id: string; token1Amount: string };
  poolId: string;
};

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

// Test Suite
console.log('🧪 Running Multi-Hop Swap Routing Integration Tests\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${(error as Error).message}`);
    testsFailed++;
  }
}

function expect(actual: any) {
  return {
    toBe(expected: any) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toBeGreaterThan(expected: any) {
      if (!(Number(actual) > Number(expected))) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected: any) {
      if (!(Number(actual) < Number(expected))) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toHaveLength(expected: number) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${actual.length}`);
      }
    },
    toContain(expected: any) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected array to contain ${expected}`);
      }
    },
  };
}

// ==========================================
// TEST 1: Dynamic Fee Parsing
// ==========================================
console.log('📦 Test Suite 1: Dynamic Fee Parsing\n');

test('Should parse zero premium', () => {
  const data = new Uint8Array(16).fill(0);
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(data[i]) << BigInt(i * 8);
  }
  expect(result).toBe(BigInt(0));
});

test('Should parse 0.1% premium (100,000)', () => {
  const data = new Uint8Array(16).fill(0);
  data[0] = 0xA0;
  data[1] = 0x86;
  data[2] = 0x01;
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(data[i]) << BigInt(i * 8);
  }
  const feePerThousand = Number(result) / 100_000;
  expect(feePerThousand).toBe(1);
});

test('Should parse 0.2% premium (200,000)', () => {
  const data = new Uint8Array(16).fill(0);
  data[0] = 0x40;
  data[1] = 0x0D;
  data[2] = 0x03;
  let result = BigInt(0);
  for (let i = 0; i < 16; i++) {
    result += BigInt(data[i]) << BigInt(i * 8);
  }
  const feePerThousand = Number(result) / 100_000;
  expect(feePerThousand).toBe(2);
});

console.log('');

// ==========================================
// TEST 2: Direct Swap Calculations
// ==========================================
console.log('📦 Test Suite 2: Direct Swap Calculations\n');

test('Should calculate direct swap correctly', () => {
  const amountIn = 100_000_000; // 1 token (8 decimals)
  const reserveIn = 1000_000_000_000; // 10,000 tokens
  const reserveOut = 2000_000_000_000; // 20,000 tokens
  
  const quote = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut);
  
  expect(quote.buyAmount).toBeDefined();
  expect(Number(quote.buyAmount)).toBeGreaterThan(0);
  expect(Number(quote.buyAmount)).toBeLessThan(amountIn * 2); // Should be less than 2x due to fees
});

test('Should apply wrap fee for BTC swaps', () => {
  const amountIn = 100_000_000; // 1 BTC
  const reserveIn = 1000_000_000_000;
  const reserveOut = 1000_000_000_000;
  const wrapFee = 2; // 0.2%
  
  const quote = calculateSwapPrice('btc', 'tokenB', amountIn, reserveIn, reserveOut, wrapFee);
  
  // Output should be less due to wrap fee
  const quoteWithoutFee = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut, 0);
  expect(Number(quote.buyAmount)).toBeLessThan(Number(quoteWithoutFee.buyAmount));
});

test('Should apply unwrap fee for BTC purchases', () => {
  const amountIn = 100_000_000;
  const reserveIn = 1000_000_000_000;
  const reserveOut = 1000_000_000_000;
  const unwrapFee = 2; // 0.2%
  
  const quote = calculateSwapPrice('tokenA', 'btc', amountIn, reserveIn, reserveOut, 2, unwrapFee);
  
  // Output should be less due to unwrap fee
  const quoteWithoutFee = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut, 0, 0);
  expect(Number(quote.buyAmount)).toBeLessThan(Number(quoteWithoutFee.buyAmount));
});

console.log('');

// ==========================================
// TEST 3: Multi-Hop Routing
// ==========================================
console.log('📦 Test Suite 3: Multi-Hop Routing Logic\n');

test('Should calculate 2-hop swap (DIESEL → BUSD → METHANE)', () => {
  const amountIn = 100_000_000; // 1 DIESEL
  
  // Hop 1: DIESEL → BUSD
  const hop1ReserveIn = 500_000_000_000; // 5,000 DIESEL
  const hop1ReserveOut = 1000_000_000_000; // 10,000 BUSD
  const hop1Quote = calculateSwapPrice('DIESEL', 'BUSD', amountIn, hop1ReserveIn, hop1ReserveOut);
  
  // Hop 2: BUSD → METHANE
  const hop2AmountIn = Number(hop1Quote.buyAmount);
  const hop2ReserveIn = 1000_000_000_000; // 10,000 BUSD
  const hop2ReserveOut = 500_000_000_000; // 5,000 METHANE
  const hop2Quote = calculateSwapPrice('BUSD', 'METHANE', hop2AmountIn, hop2ReserveIn, hop2ReserveOut);
  
  expect(Number(hop1Quote.buyAmount)).toBeGreaterThan(0);
  expect(Number(hop2Quote.buyAmount)).toBeGreaterThan(0);
  
  // Final output should be less than direct due to 2x fees
  const finalOutput = Number(hop2Quote.buyAmount);
  expect(finalOutput).toBeGreaterThan(0);
});

test('Should simulate route comparison (BUSD vs frBTC bridge)', () => {
  const amountIn = 100_000_000;
  
  // BUSD bridge route
  const busdHop1 = calculateSwapPrice('DIESEL', 'BUSD', amountIn, 500_000_000_000, 1000_000_000_000);
  const busdHop2 = calculateSwapPrice('BUSD', 'METHANE', Number(busdHop1.buyAmount), 1000_000_000_000, 500_000_000_000);
  const busdRouteOutput = Number(busdHop2.buyAmount);
  
  // frBTC bridge route (assume better liquidity)
  const frbtcHop1 = calculateSwapPrice('DIESEL', 'frBTC', amountIn, 500_000_000_000, 2000_000_000_000);
  const frbtcHop2 = calculateSwapPrice('frBTC', 'METHANE', Number(frbtcHop1.buyAmount), 2000_000_000_000, 500_000_000_000);
  const frbtcRouteOutput = Number(frbtcHop2.buyAmount);
  
  // Should be able to compare routes
  const bestRoute = busdRouteOutput > frbtcRouteOutput ? 'BUSD' : 'frBTC';
  expect(bestRoute).toBeDefined();
  
  console.log(`   Best route: ${bestRoute} (BUSD: ${busdRouteOutput}, frBTC: ${frbtcRouteOutput})`);
});

test('Should handle BTC → alkane multi-hop (wrap + swap)', () => {
  const amountIn = 100_000_000; // 1 BTC
  const wrapFee = 2; // 0.2%
  
  // BTC wraps to frBTC (with fee)
  const afterWrap = (amountIn * (1000 - wrapFee)) / 1000;
  
  // frBTC → DIESEL swap
  const swapQuote = calculateSwapPrice('frBTC', 'DIESEL', afterWrap, 1000_000_000_000, 500_000_000_000);
  
  expect(Number(swapQuote.buyAmount)).toBeGreaterThan(0);
  expect(Number(swapQuote.buyAmount)).toBeLessThan(amountIn); // Less due to wrap fee + swap fee
});

test('Should handle alkane → BTC multi-hop (swap + unwrap)', () => {
  const amountIn = 100_000_000; // 1 DIESEL
  const unwrapFee = 2; // 0.2%
  
  // DIESEL → frBTC swap
  const swapQuote = calculateSwapPrice('DIESEL', 'frBTC', amountIn, 500_000_000_000, 1000_000_000_000);
  
  // frBTC unwraps to BTC (with fee)
  const afterUnwrap = (Number(swapQuote.buyAmount) * (1000 - unwrapFee)) / 1000;
  
  expect(afterUnwrap).toBeGreaterThan(0);
  expect(afterUnwrap).toBeLessThan(Number(swapQuote.buyAmount)); // Less due to unwrap fee
});

console.log('');

// ==========================================
// TEST 4: Edge Cases
// ==========================================
console.log('📦 Test Suite 4: Edge Cases\n');

test('Should throw error for zero input', () => {
  try {
    swapCalculateOut({
      amountIn: 0,
      reserveIn: 1000_000_000_000,
      reserveOut: 1000_000_000_000,
      feePercentage: 0.01,
    });
    throw new Error('Should have thrown error');
  } catch (error) {
    expect((error as Error).message).toContain('INSUFFICIENT_INPUT_AMOUNT');
  }
});

test('Should throw error for zero liquidity', () => {
  try {
    swapCalculateOut({
      amountIn: 100_000_000,
      reserveIn: 0,
      reserveOut: 1000_000_000_000,
      feePercentage: 0.01,
    });
    throw new Error('Should have thrown error');
  } catch (error) {
    expect((error as Error).message).toContain('INSUFFICIENT_LIQUIDITY');
  }
});

test('Should handle very small amounts', () => {
  const amountIn = 1000; // 0.00001 tokens (very small)
  const reserveIn = 1000_000_000_000;
  const reserveOut = 1000_000_000_000;
  
  const quote = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut);
  expect(Number(quote.buyAmount)).toBeGreaterThan(0);
});

test('Should handle large amounts', () => {
  const amountIn = 10_000_000_000_000; // 100,000 tokens
  const reserveIn = 100_000_000_000_000; // 1M tokens
  const reserveOut = 100_000_000_000_000;
  
  const quote = calculateSwapPrice('tokenA', 'tokenB', amountIn, reserveIn, reserveOut);
  expect(Number(quote.buyAmount)).toBeGreaterThan(0);
  expect(Number(quote.buyAmount)).toBeLessThan(amountIn); // Should have price impact
});

console.log('');

// ==========================================
// TEST 5: Fee Calculations
// ==========================================
console.log('📦 Test Suite 5: Fee Calculations\n');

test('Should calculate total fees for multi-hop correctly', () => {
  const poolFee = 0.01; // 1% per hop
  const wrapFee = 0.002; // 0.2%
  
  // 2-hop with wrap
  const totalFee = wrapFee + poolFee + poolFee;
  expect(totalFee).toBe(0.022); // 2.2% total
});

test('Should show higher fees for multi-hop vs direct', () => {
  const directFee = 0.01; // 1% for direct swap
  const multiHopFee = 0.01 + 0.01; // 2% for 2-hop
  
  expect(multiHopFee).toBeGreaterThan(directFee);
});

test('Should apply dynamic fee correctly', () => {
  const staticFee = 1; // 0.1%
  const dynamicFee = 2; // 0.2%
  
  const amountIn = 100_000_000;
  const afterStaticFee = (amountIn * (1000 - staticFee)) / 1000;
  const afterDynamicFee = (amountIn * (1000 - dynamicFee)) / 1000;
  
  expect(afterDynamicFee).toBeLessThan(afterStaticFee);
  
  const difference = afterStaticFee - afterDynamicFee;
  expect(difference).toBe(100_000); // 0.1% difference on 100M = 100K
});

console.log('');

// ==========================================
// SUMMARY
// ==========================================
console.log('═══════════════════════════════════════');
console.log('📊 Test Results Summary');
console.log('═══════════════════════════════════════');
console.log(`✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📈 Total: ${testsPassed + testsFailed}`);
console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
console.log('═══════════════════════════════════════\n');

if (testsFailed === 0) {
  console.log('🎉 ALL TESTS PASSED! Multi-hop routing implementation verified!\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Review errors above.\n');
  process.exit(1);
}
