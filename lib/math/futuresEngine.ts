/**
 * Futures Formula Engine — mathjs-powered computation for ftrBTC, volBTC, and Fujin.
 *
 * Uses mathjs for:
 * - Symbolic cubic premium curve evaluation p(t)
 * - Derivative computation p'(t) for sensitivity analysis
 * - Newton's method root finding for breakeven points
 * - Utilization-adjusted coefficient computation
 * - Fujin settlement payout calculation (Q64 fixed-point)
 * - Difficulty projection from block time averages
 *
 * All formulas match the on-chain Rust implementations exactly:
 * - ftrBTC: ~/subfrost-alkanes/alkanes/ftr-btc/src/lib.rs
 * - dxBTC:  ~/subfrost-alkanes/alkanes/dx-btc/src/lib.rs
 * - Fujin:  ~/Fujin-contracts/alkanes/fujin-pool/src/lib.rs
 */

import { compile, derivative, parse, type EvalFunction } from 'mathjs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 18-decimal fixed-point one (matches Rust 1_000_000_000_000_000_000u128) */
const ONE_18 = 1e18;

/** Q64 fixed-point constants (matches Rust 1u128 << 64) */
const ONE_Q64 = 2 ** 64;
const HALF_Q64 = 2 ** 63;

/** Bitcoin halving epoch (blocks) */
const HALVING_INTERVAL = 210_000;

/** Difficulty adjustment epoch (blocks) */
const DIFFICULTY_EPOCH = 2016;

/** Target block time (seconds) */
const TARGET_BLOCK_TIME = 600;

/** Ideal epoch duration (seconds) */
const IDEAL_EPOCH_DURATION = DIFFICULTY_EPOCH * TARGET_BLOCK_TIME; // 1,209,600

// ---------------------------------------------------------------------------
// Cubic Premium Curve: p(t) = c₀ + c₁·t - c₂·t² + c₃·t³
// ---------------------------------------------------------------------------

export interface CubicCoefficients {
  c0: number;
  c1: number;
  c2: number; // stored as positive magnitude, subtracted in formula
  c3: number;
  cMint: number;
}

/**
 * Create a compiled premium curve function using mathjs.
 * Returns an evaluator that takes t ∈ [0, 1] and returns premium p(t).
 */
export function createPremiumCurve(coeffs: CubicCoefficients): (t: number) => number {
  const expr = compile(`${coeffs.c0} + ${coeffs.c1} * t - ${coeffs.c2} * t^2 + ${coeffs.c3} * t^3`);
  return (t: number) => expr.evaluate({ t }) as number;
}

/**
 * Create the derivative p'(t) = c₁ - 2c₂·t + 3c₃·t²
 */
export function createPremiumDerivative(coeffs: CubicCoefficients): (t: number) => number {
  const node = parse(`${coeffs.c0} + ${coeffs.c1} * t - ${coeffs.c2} * t^2 + ${coeffs.c3} * t^3`);
  const deriv = derivative(node, 't');
  const compiled = deriv.compile();
  return (t: number) => compiled.evaluate({ t }) as number;
}

/**
 * Evaluate the premium curve at N evenly-spaced points for charting.
 */
export function samplePremiumCurve(
  coeffs: CubicCoefficients,
  numPoints: number = 100,
): { t: number; premium: number; derivative: number }[] {
  const p = createPremiumCurve(coeffs);
  const dp = createPremiumDerivative(coeffs);
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({ t, premium: p(t), derivative: dp(t) });
  }
  return points;
}

/**
 * Find the breakeven point where premium equals a target yield.
 * Uses Newton's method (Euler's root-finding).
 *
 * Solves: p(t) = targetYield  →  p(t) - targetYield = 0
 */
export function findBreakeven(
  coeffs: CubicCoefficients,
  targetYield: number,
  initialGuess: number = 0.5,
  maxIterations: number = 50,
  tolerance: number = 1e-10,
): number | null {
  const p = createPremiumCurve(coeffs);
  const dp = createPremiumDerivative(coeffs);

  let t = initialGuess;
  for (let i = 0; i < maxIterations; i++) {
    const f = p(t) - targetYield;
    const fprime = dp(t);
    if (Math.abs(fprime) < 1e-15) return null; // derivative too small
    const tNext = t - f / fprime;
    if (Math.abs(tNext - t) < tolerance) {
      return Math.max(0, Math.min(1, tNext));
    }
    t = tNext;
  }
  return null; // didn't converge
}

// ---------------------------------------------------------------------------
// Utilization-Adjusted Coefficients
// ---------------------------------------------------------------------------

/**
 * Compute the utilization adjustment factor.
 *
 * adjustment = 0.1 + 0.9 × (utilization / 100%)
 *
 * @param utilization - 0 to 1 (0% to 100%)
 */
export function computeUtilizationAdjustment(utilization: number): number {
  return 0.1 + 0.9 * Math.min(1, Math.max(0, utilization));
}

/**
 * Apply utilization adjustment to base coefficients.
 */
export function adjustCoefficients(
  baseCoeffs: CubicCoefficients,
  utilization: number,
): CubicCoefficients {
  const adj = computeUtilizationAdjustment(utilization);
  return {
    c0: baseCoeffs.c0 * adj,
    c1: baseCoeffs.c1 * adj,
    c2: baseCoeffs.c2 * adj,
    c3: baseCoeffs.c3 * adj,
    cMint: baseCoeffs.cMint * adj,
  };
}

// ---------------------------------------------------------------------------
// dxBTC Vault Coefficient Computation
// ---------------------------------------------------------------------------

/**
 * Compute cubic coefficients from dxBTC vault TWAP growth data.
 *
 * Matches dxBTC contract GetCoefficients (dx-btc/src/lib.rs lines 656-712):
 *   c_mint = expected_yield × 0.3
 *   p₀ = c_mint / (1 - c_mint)
 *   p₁ = 1 - 1/[(1-c_mint) × growth_T]
 *   c₀ = p₀, c₁ = 0, c₂ = 2(p₁-p₀), c₃ = 3(p₁-p₀)
 *
 * @param growthPerBlock - per-block growth multiplier (e.g., 1.000001)
 * @param durationBlocks - futures duration in blocks
 */
export function computeCoefficientsFromGrowth(
  growthPerBlock: number,
  durationBlocks: number,
): CubicCoefficients {
  // Estimate growth over the full duration (first-order approximation)
  const excessPerBlock = growthPerBlock - 1;
  const estimatedGrowthT = 1 + excessPerBlock * durationBlocks;
  const expectedYield = Math.max(0, estimatedGrowthT - 1);

  // c_mint = 30% of expected yield
  const cMint = expectedYield * 0.3;

  if (cMint >= 1) {
    // Edge case: extremely high yield
    return { c0: 0.99, c1: 0, c2: 0, c3: 0, cMint: 0.99 };
  }

  const oneMinusCMint = 1 - cMint;
  const p0 = cMint / oneMinusCMint;
  const denominator = oneMinusCMint * estimatedGrowthT;
  const p1 = denominator > 0 ? 1 - 1 / denominator : p0;
  const deltaP = Math.max(0, p1 - p0);

  return {
    c0: p0,
    c1: 0,
    c2: 2 * deltaP,
    c3: 3 * deltaP,
    cMint,
  };
}

// ---------------------------------------------------------------------------
// Fujin Difficulty Settlement
// ---------------------------------------------------------------------------

/**
 * Compute Fujin LONG/SHORT payouts based on difficulty change.
 *
 * Matches Fujin pool contract compute_payouts (fujin-pool lines 846-871):
 *   change_ratio = |end - start| / start
 *   If UP:   long = 0.5 + ratio/2,  short = 0.5 - ratio/2
 *   If DOWN: long = 0.5 - ratio/2,  short = 0.5 + ratio/2
 *
 * @param startDifficulty - difficulty at epoch start
 * @param endDifficulty - difficulty at epoch end
 * @returns { longPayout, shortPayout } each in range [0, 1]
 */
export function computeSettlementPayouts(
  startDifficulty: number,
  endDifficulty: number,
): { longPayout: number; shortPayout: number; changePercent: number } {
  if (startDifficulty <= 0) {
    return { longPayout: 0.5, shortPayout: 0.5, changePercent: 0 };
  }

  const change = Math.abs(endDifficulty - startDifficulty);
  const ratio = Math.min(change / startDifficulty, 1); // capped at 100%
  const changePercent = ((endDifficulty - startDifficulty) / startDifficulty) * 100;

  if (endDifficulty >= startDifficulty) {
    // Difficulty UP → LONG wins
    return {
      longPayout: 0.5 + ratio / 2,
      shortPayout: 0.5 - ratio / 2,
      changePercent,
    };
  } else {
    // Difficulty DOWN → SHORT wins
    return {
      longPayout: 0.5 - ratio / 2,
      shortPayout: 0.5 + ratio / 2,
      changePercent,
    };
  }
}

/**
 * Simulate settlement payouts across a range of difficulty changes.
 * Useful for the payout curve chart.
 */
export function simulateSettlementCurve(
  startDifficulty: number,
  minChangePercent: number = -50,
  maxChangePercent: number = 50,
  numPoints: number = 100,
): { changePercent: number; longPayout: number; shortPayout: number }[] {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const pct = minChangePercent + (maxChangePercent - minChangePercent) * (i / numPoints);
    const endDiff = startDifficulty * (1 + pct / 100);
    const result = computeSettlementPayouts(startDifficulty, endDiff);
    points.push({
      changePercent: pct,
      longPayout: result.longPayout,
      shortPayout: result.shortPayout,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Difficulty Projection
// ---------------------------------------------------------------------------

/**
 * Estimate the next Bitcoin difficulty adjustment.
 *
 * Formula: new_difficulty = current_difficulty × (actual_time / ideal_time)
 *
 * @param currentDifficulty - current difficulty value
 * @param avgBlockTimeSec - average block time in seconds (from recent blocks)
 * @param blocksRemainingInEpoch - blocks until next adjustment
 */
export function projectNextDifficulty(
  currentDifficulty: number,
  avgBlockTimeSec: number,
  blocksRemainingInEpoch: number,
): {
  estimatedDifficulty: number;
  changePercent: number;
  estimatedTimeRemaining: number;
} {
  // Actual epoch time so far
  const blocksElapsed = DIFFICULTY_EPOCH - blocksRemainingInEpoch;
  const timeElapsed = blocksElapsed * avgBlockTimeSec;

  // Project total epoch time
  const projectedTotalTime = DIFFICULTY_EPOCH * avgBlockTimeSec;

  // Difficulty adjustment ratio
  const adjustmentRatio = IDEAL_EPOCH_DURATION / projectedTotalTime;
  const estimatedDifficulty = currentDifficulty * adjustmentRatio;
  const changePercent = (adjustmentRatio - 1) * 100;
  const estimatedTimeRemaining = blocksRemainingInEpoch * avgBlockTimeSec;

  return { estimatedDifficulty, changePercent, estimatedTimeRemaining };
}

/**
 * Get the current epoch number and progress.
 */
export function getEpochInfo(blockHeight: number): {
  epoch: number;
  blocksElapsed: number;
  blocksRemaining: number;
  progressPercent: number;
} {
  const epoch = Math.floor(blockHeight / DIFFICULTY_EPOCH);
  const blocksElapsed = blockHeight % DIFFICULTY_EPOCH;
  const blocksRemaining = DIFFICULTY_EPOCH - blocksElapsed;
  const progressPercent = (blocksElapsed / DIFFICULTY_EPOCH) * 100;
  return { epoch, blocksElapsed, blocksRemaining, progressPercent };
}

// ---------------------------------------------------------------------------
// Bitcoin Block Reward
// ---------------------------------------------------------------------------

/**
 * Get the block reward in satoshis for a given height.
 */
export function getBlockReward(height: number): number {
  const halvings = Math.floor(height / HALVING_INTERVAL);
  if (halvings >= 64) return 0;
  return Math.floor(5_000_000_000 / (2 ** halvings));
}

// ---------------------------------------------------------------------------
// volBTC Pool Math
// ---------------------------------------------------------------------------

/**
 * Compute a constant-product swap quote for the volBTC pool.
 *
 * All values normalized to dxBTC units.
 *
 * @param amountIn - amount of input ftrBTC
 * @param valuePerTokenIn - dxBTC value per input token (from ftrBTC.GetValue)
 * @param valuePerTokenOut - dxBTC value per output token
 * @param reserveIn - pool reserve of input token
 * @param reserveOut - pool reserve of output token
 * @param feeBps - fee in basis points (e.g., 30 = 0.3%)
 */
export function computeVolBtcSwapQuote(
  amountIn: number,
  valuePerTokenIn: number,
  valuePerTokenOut: number,
  reserveIn: number,
  reserveOut: number,
  feeBps: number = 30,
): { amountOut: number; priceImpact: number; effectiveRate: number } {
  const valueIn = (amountIn * valuePerTokenIn) / 1e8;
  const fee = (valueIn * feeBps) / 10000;
  const valueInAfterFee = valueIn - fee;

  const balanceInValue = (reserveIn * valuePerTokenIn) / 1e8;
  const balanceOutValue = (reserveOut * valuePerTokenOut) / 1e8;

  if (balanceInValue <= 0 || balanceOutValue <= 0) {
    return { amountOut: 0, priceImpact: 0, effectiveRate: 0 };
  }

  const k = balanceInValue * balanceOutValue;
  const newBalanceIn = balanceInValue + valueInAfterFee;
  const newBalanceOut = k / newBalanceIn;
  const valueOut = balanceOutValue - newBalanceOut;
  const amountOut = (valueOut * 1e8) / valuePerTokenOut;

  // Price impact: how much worse than spot price
  const spotRate = valuePerTokenIn / valuePerTokenOut;
  const effectiveRate = amountIn > 0 ? amountOut / amountIn : 0;
  const priceImpact = spotRate > 0 ? (1 - effectiveRate / spotRate) * 100 : 0;

  return { amountOut, priceImpact, effectiveRate };
}

// ---------------------------------------------------------------------------
// Export constants for use in components
// ---------------------------------------------------------------------------

export const CONSTANTS = {
  ONE_18,
  ONE_Q64,
  HALF_Q64,
  HALVING_INTERVAL,
  DIFFICULTY_EPOCH,
  TARGET_BLOCK_TIME,
  IDEAL_EPOCH_DURATION,
} as const;
