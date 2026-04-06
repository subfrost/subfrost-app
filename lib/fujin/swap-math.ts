/**
 * Fujin AMM swap math — ported from fuboku-app/lib/swap-math.ts
 * Pure functions for LONG/SHORT price quotes.
 */

export const POOL_FEE_BPS = 100n; // 1%

export function calculateSwapOutput(
  inputAmount: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: bigint = POOL_FEE_BPS,
): bigint {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;
  const inputWithFee = inputAmount * (10000n - feeBps);
  const numerator = inputWithFee * reserveOut;
  const denominator = reserveIn * 10000n + inputWithFee;
  return numerator / denominator;
}

export function calculatePriceImpact(
  swapOut: bigint,
  swapIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): number {
  if (reserveIn === 0n || reserveOut === 0n || swapIn === 0n) return 0;
  const execScaled = Number(swapOut) * Number(reserveIn);
  const spotScaled = Number(swapIn) * Number(reserveOut);
  if (spotScaled === 0) return 0;
  return Math.max(0, (1 - execScaled / spotScaled) * 100);
}

/**
 * DIESEL → LONG or SHORT via zap.
 * MintPair (equal LONG+SHORT) → sell unwanted side → return desired.
 */
export function computeSwapZapQuote(
  dieselAmount: bigint,
  direction: 'LONG' | 'SHORT',
  longReserve: bigint,
  shortReserve: bigint,
  slippageBps: number = 50,
) {
  if (dieselAmount <= 0n || longReserve === 0n || shortReserve === 0n) return null;

  const minted = dieselAmount;
  const [reserveIn, reserveOut] = direction === 'LONG'
    ? [shortReserve, longReserve]
    : [longReserve, shortReserve];

  const swapOut = calculateSwapOutput(minted, reserveIn, reserveOut);
  const expectedOutput = minted + swapOut;
  const priceImpact = calculatePriceImpact(swapOut, minted, reserveIn, reserveOut);

  const swapOutNoFee = (reserveIn + minted) > 0n
    ? (minted * reserveOut) / (reserveIn + minted)
    : 0n;
  const feeAmount = swapOutNoFee > swapOut ? swapOutNoFee - swapOut : 0n;

  const slippageMultiplier = 10000n - BigInt(slippageBps);
  const minimumReceived = (expectedOutput * slippageMultiplier) / 10000n;

  return {
    expectedOutput,
    swapOut,
    minted,
    feeAmount,
    priceImpact: Math.max(0, priceImpact),
    minimumReceived,
  };
}

export function formatTokenAmount(amount: bigint, decimals: number = 8): string {
  if (amount === 0n) return '0';
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  if (fraction === 0n) return whole.toLocaleString();
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fractionStr}`;
}
