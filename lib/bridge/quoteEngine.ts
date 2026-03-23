/**
 * Bridge Quote Engine — computes full cross-chain swap quotes.
 *
 * Chains together:
 * 1. EVM protocol fee (0.1%)
 * 2. USDC/USDT → frUSD decimal conversion (6→18 decimals)
 * 3. Synth pool swap (frUSD ↔ frBTC, StableSwap curve)
 * 4. frBTC → BTC unwrap (1:1 minus wrap fee)
 *
 * All computation is client-side — no backend needed.
 */

// Protocol fee: 10 basis points = 0.1%
const PROTOCOL_FEE_BPS = 10;
const BPS_BASE = 10000;

// Decimal conversions
const USDC_DECIMALS = 6;
const USDT_DECIMALS = 6;
const FRUSD_DECIMALS = 18;
const FRBTC_DECIMALS = 8;
const BTC_DECIMALS = 8;
const DECIMAL_MULTIPLIER = 10n ** 12n; // 6-dec → 18-dec

// frBTC wrap fee (per 1000)
const FRBTC_WRAP_FEE_PER_1000 = 5; // 0.5%

export type StableToken = 'USDT' | 'USDC';
export type Direction = 'to-btc' | 'to-stable';

export interface BridgeQuote {
  direction: Direction;
  inputToken: StableToken | 'BTC';
  outputToken: StableToken | 'BTC';
  inputAmount: bigint;
  protocolFee: bigint;
  netInputAfterFee: bigint;
  frUsdAmount: bigint;         // frUSD after conversion
  synthPoolOutput: bigint;     // frBTC from synth pool (or frUSD if reverse)
  finalOutput: bigint;         // BTC after unwrap (or stable after conversion)
  priceImpact: number;         // Synth pool price impact %
  estimatedTimeMinutes: number;
  feeBreakdown: {
    protocolFee: string;       // Human-readable
    synthPoolFee: string;
    wrapFee: string;
    totalFees: string;
  };
}

/**
 * Compute a quote for stablecoins → BTC.
 *
 * Flow: USDT/USDC → (fee) → frUSD → (synth pool) → frBTC → (unwrap) → BTC
 */
export function quoteStableToBtc(
  inputToken: StableToken,
  inputAmount: bigint,
  synthPoolReserves: { frbtcReserve: bigint; frusdReserve: bigint; feePerMille: number },
): BridgeQuote {
  // Step 1: Protocol fee
  const protocolFee = (inputAmount * BigInt(PROTOCOL_FEE_BPS)) / BigInt(BPS_BASE);
  const netInput = inputAmount - protocolFee;

  // Step 2: Convert to frUSD (6-dec → 18-dec)
  const frUsdAmount = netInput * DECIMAL_MULTIPLIER;

  // Step 3: Synth pool swap (frUSD → frBTC)
  const { amountOut: frbtcOut, priceImpact } = computeStableSwap(
    frUsdAmount,
    synthPoolReserves.frusdReserve,
    synthPoolReserves.frbtcReserve,
    synthPoolReserves.feePerMille,
  );

  // Step 4: frBTC → BTC (1:1 minus wrap fee)
  const wrapFee = (frbtcOut * BigInt(FRBTC_WRAP_FEE_PER_1000)) / 1000n;
  const btcOutput = frbtcOut - wrapFee;

  // Fee breakdown
  const totalFees = protocolFee + wrapFee;
  const inputDecimals = inputToken === 'USDT' ? USDT_DECIMALS : USDC_DECIMALS;

  return {
    direction: 'to-btc',
    inputToken,
    outputToken: 'BTC',
    inputAmount,
    protocolFee,
    netInputAfterFee: netInput,
    frUsdAmount,
    synthPoolOutput: frbtcOut,
    finalOutput: btcOutput,
    priceImpact,
    estimatedTimeMinutes: 15,
    feeBreakdown: {
      protocolFee: `${formatAmount(protocolFee, inputDecimals)} ${inputToken} (0.1%)`,
      synthPoolFee: `${synthPoolReserves.feePerMille / 10}% pool fee`,
      wrapFee: `${formatAmount(wrapFee, FRBTC_DECIMALS)} BTC (0.5% unwrap)`,
      totalFees: `~${formatAmount(totalFees, inputDecimals)} ${inputToken} equiv`,
    },
  };
}

/**
 * Compute a quote for BTC → stablecoins.
 *
 * Flow: BTC → (wrap) → frBTC → (synth pool) → frUSD → (bridge) → USDT/USDC
 */
export function quoteBtcToStable(
  outputToken: StableToken,
  btcAmount: bigint,
  synthPoolReserves: { frbtcReserve: bigint; frusdReserve: bigint; feePerMille: number },
): BridgeQuote {
  // Step 1: BTC → frBTC (wrap, minus fee)
  const wrapFee = (btcAmount * BigInt(FRBTC_WRAP_FEE_PER_1000)) / 1000n;
  const frbtcAmount = btcAmount - wrapFee;

  // Step 2: Synth pool swap (frBTC → frUSD)
  const { amountOut: frusdOut, priceImpact } = computeStableSwap(
    frbtcAmount,
    synthPoolReserves.frbtcReserve,
    synthPoolReserves.frusdReserve,
    synthPoolReserves.feePerMille,
  );

  // Step 3: frUSD → USDC/USDT (18-dec → 6-dec)
  const stableAmount = frusdOut / DECIMAL_MULTIPLIER;

  // Step 4: Protocol fee on withdrawal
  const protocolFee = (stableAmount * BigInt(PROTOCOL_FEE_BPS)) / BigInt(BPS_BASE);
  const finalOutput = stableAmount - protocolFee;

  return {
    direction: 'to-stable',
    inputToken: 'BTC',
    outputToken,
    inputAmount: btcAmount,
    protocolFee,
    netInputAfterFee: frbtcAmount,
    frUsdAmount: frusdOut,
    synthPoolOutput: frusdOut,
    finalOutput,
    priceImpact,
    estimatedTimeMinutes: 20,
    feeBreakdown: {
      protocolFee: `${formatAmount(protocolFee, USDC_DECIMALS)} ${outputToken} (0.1%)`,
      synthPoolFee: `${synthPoolReserves.feePerMille / 10}% pool fee`,
      wrapFee: `${formatAmount(wrapFee, BTC_DECIMALS)} BTC (0.5% wrap)`,
      totalFees: `~${formatAmount(protocolFee, USDC_DECIMALS)} ${outputToken} + ${formatAmount(wrapFee, BTC_DECIMALS)} BTC`,
    },
  };
}

/**
 * StableSwap constant-product approximation.
 *
 * For the synth pool (frBTC ↔ frUSD), uses xy=k with fee.
 * In production, the synth pool uses a StableSwap curve which has
 * much lower slippage. This is a conservative estimate.
 */
function computeStableSwap(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feePerMille: number,
): { amountOut: bigint; priceImpact: number } {
  if (reserveIn <= 0n || reserveOut <= 0n) {
    return { amountOut: 0n, priceImpact: 0 };
  }

  // Apply fee
  const feeMultiplier = BigInt(1000 - feePerMille);
  const amountInWithFee = amountIn * feeMultiplier;

  // xy=k formula
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  const amountOut = numerator / denominator;

  // Price impact
  const spotPrice = Number(reserveOut) / Number(reserveIn);
  const effectivePrice = amountIn > 0n ? Number(amountOut) / Number(amountIn) : 0;
  const priceImpact = spotPrice > 0 ? Math.abs(1 - effectivePrice / spotPrice) * 100 : 0;

  return { amountOut, priceImpact };
}

/**
 * Format a bigint amount for display.
 */
function formatAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, Math.min(decimals, 4));
  return `${whole}.${fracStr}`;
}

export { formatAmount, computeStableSwap };
