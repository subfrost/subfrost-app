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

// ── Cross-chain bridge types ──

export interface SynthPoolReserves {
  frbtcReserve: bigint;
  frusdReserve: bigint;
  feePerMille: number;
}

export interface BridgeFees {
  protocolFeeBps: number;    // basis points (e.g., 10 = 0.1%)
  wrapFeePerMille: number;   // per 1000 (e.g., 5 = 0.5%)
}

// ── ETH bridge constants ──

const ETH_DECIMALS = 18;
const FRETH_DECIMALS = 8;
const ETH_TO_FRETH_FACTOR = 10n ** 10n; // 18 -> 8 decimals

// ── ZEC bridge constants ──

const ZEC_DECIMALS = 8; // zatoshi
const FRZEC_DECIMALS = 8;
const ZEC_TO_FRZEC_FACTOR = 1n; // both 8 decimals, 1:1

const DEFAULT_FEES: BridgeFees = {
  protocolFeeBps: PROTOCOL_FEE_BPS,
  wrapFeePerMille: FRBTC_WRAP_FEE_PER_1000,
};

// ── ETH <-> BTC quotes ──

/**
 * Compute a quote for ETH -> BTC.
 *
 * Flow: ETH (wei) -> (fee) -> frETH (8-dec) -> (synth pool) -> frBTC -> (unwrap) -> BTC
 *
 * The synth pool here is an ETH/BTC pool with frETH and frBTC reserves.
 */
export function quoteEthToBtc(
  ethWei: bigint,
  reserves: SynthPoolReserves,
  fees: BridgeFees = DEFAULT_FEES,
): BridgeQuote {
  // Step 1: Protocol fee on ETH input
  const protocolFee = (ethWei * BigInt(fees.protocolFeeBps)) / BigInt(BPS_BASE);
  const netEth = ethWei - protocolFee;

  // Step 2: Convert ETH (18-dec) to frETH (8-dec)
  const frethAmount = netEth / ETH_TO_FRETH_FACTOR;

  // Step 3: Synth pool swap (frETH -> frBTC)
  // reserves.frusdReserve is used as the frETH reserve side in this context
  const { amountOut: frbtcOut, priceImpact } = computeStableSwap(
    frethAmount,
    reserves.frusdReserve, // frETH reserve
    reserves.frbtcReserve, // frBTC reserve
    reserves.feePerMille,
  );

  // Step 4: frBTC -> BTC (1:1 minus wrap fee)
  const wrapFee = (frbtcOut * BigInt(fees.wrapFeePerMille)) / 1000n;
  const btcOutput = frbtcOut - wrapFee;

  // Protocol fee in ETH terms for display
  const protocolFeeEth = protocolFee;
  const ethInputDec = ETH_DECIMALS;

  return {
    direction: 'to-btc',
    inputToken: 'BTC' as StableToken | 'BTC', // type overloaded for cross-chain
    outputToken: 'BTC',
    inputAmount: ethWei,
    protocolFee: protocolFeeEth,
    netInputAfterFee: netEth,
    frUsdAmount: frethAmount, // frETH amount (reusing field)
    synthPoolOutput: frbtcOut,
    finalOutput: btcOutput,
    priceImpact,
    estimatedTimeMinutes: 20,
    feeBreakdown: {
      protocolFee: `${formatAmount(protocolFee, ethInputDec)} ETH (${fees.protocolFeeBps / 100}%)`,
      synthPoolFee: `${reserves.feePerMille / 10}% pool fee`,
      wrapFee: `${formatAmount(wrapFee, BTC_DECIMALS)} BTC (${fees.wrapFeePerMille / 10}% unwrap)`,
      totalFees: `~${formatAmount(protocolFee, ethInputDec)} ETH + ${formatAmount(wrapFee, BTC_DECIMALS)} BTC`,
    },
  };
}

/**
 * Compute a quote for BTC -> ETH.
 *
 * Flow: BTC -> (wrap) -> frBTC -> (synth pool) -> frETH -> (bridge) -> ETH
 */
export function quoteBtcToEth(
  btcSats: bigint,
  reserves: SynthPoolReserves,
  fees: BridgeFees = DEFAULT_FEES,
): BridgeQuote {
  // Step 1: BTC -> frBTC (wrap, minus fee)
  const wrapFee = (btcSats * BigInt(fees.wrapFeePerMille)) / 1000n;
  const frbtcAmount = btcSats - wrapFee;

  // Step 2: Synth pool swap (frBTC -> frETH)
  const { amountOut: frethOut, priceImpact } = computeStableSwap(
    frbtcAmount,
    reserves.frbtcReserve, // frBTC reserve
    reserves.frusdReserve, // frETH reserve (reusing field)
    reserves.feePerMille,
  );

  // Step 3: frETH (8-dec) -> ETH (18-dec)
  const ethWei = frethOut * ETH_TO_FRETH_FACTOR;

  // Step 4: Protocol fee on ETH output
  const protocolFee = (ethWei * BigInt(fees.protocolFeeBps)) / BigInt(BPS_BASE);
  const finalOutput = ethWei - protocolFee;

  return {
    direction: 'to-stable',
    inputToken: 'BTC',
    outputToken: 'BTC' as StableToken | 'BTC', // type overloaded
    inputAmount: btcSats,
    protocolFee,
    netInputAfterFee: frbtcAmount,
    frUsdAmount: frethOut, // frETH amount
    synthPoolOutput: frethOut,
    finalOutput,
    priceImpact,
    estimatedTimeMinutes: 25,
    feeBreakdown: {
      protocolFee: `${formatAmount(protocolFee, ETH_DECIMALS)} ETH (${fees.protocolFeeBps / 100}%)`,
      synthPoolFee: `${reserves.feePerMille / 10}% pool fee`,
      wrapFee: `${formatAmount(wrapFee, BTC_DECIMALS)} BTC (${fees.wrapFeePerMille / 10}% wrap)`,
      totalFees: `~${formatAmount(protocolFee, ETH_DECIMALS)} ETH + ${formatAmount(wrapFee, BTC_DECIMALS)} BTC`,
    },
  };
}

// ── ZEC <-> BTC quotes ──

/**
 * Compute a quote for ZEC -> BTC.
 *
 * Flow: ZEC (zatoshi) -> (fee) -> frZEC (8-dec) -> (synth pool) -> frBTC -> (unwrap) -> BTC
 */
export function quoteZecToBtc(
  zecZatoshi: bigint,
  reserves: SynthPoolReserves,
  fees: BridgeFees = DEFAULT_FEES,
): BridgeQuote {
  // Step 1: Protocol fee on ZEC input
  const protocolFee = (zecZatoshi * BigInt(fees.protocolFeeBps)) / BigInt(BPS_BASE);
  const netZec = zecZatoshi - protocolFee;

  // Step 2: ZEC (8-dec) -> frZEC (8-dec) — 1:1
  const frzecAmount = netZec / ZEC_TO_FRZEC_FACTOR;

  // Step 3: Synth pool swap (frZEC -> frBTC)
  const { amountOut: frbtcOut, priceImpact } = computeStableSwap(
    frzecAmount,
    reserves.frusdReserve, // frZEC reserve
    reserves.frbtcReserve, // frBTC reserve
    reserves.feePerMille,
  );

  // Step 4: frBTC -> BTC (1:1 minus wrap fee)
  const wrapFee = (frbtcOut * BigInt(fees.wrapFeePerMille)) / 1000n;
  const btcOutput = frbtcOut - wrapFee;

  return {
    direction: 'to-btc',
    inputToken: 'BTC' as StableToken | 'BTC',
    outputToken: 'BTC',
    inputAmount: zecZatoshi,
    protocolFee,
    netInputAfterFee: netZec,
    frUsdAmount: frzecAmount, // frZEC amount
    synthPoolOutput: frbtcOut,
    finalOutput: btcOutput,
    priceImpact,
    estimatedTimeMinutes: 30, // ZEC has ~75s block time
    feeBreakdown: {
      protocolFee: `${formatAmount(protocolFee, ZEC_DECIMALS)} ZEC (${fees.protocolFeeBps / 100}%)`,
      synthPoolFee: `${reserves.feePerMille / 10}% pool fee`,
      wrapFee: `${formatAmount(wrapFee, BTC_DECIMALS)} BTC (${fees.wrapFeePerMille / 10}% unwrap)`,
      totalFees: `~${formatAmount(protocolFee, ZEC_DECIMALS)} ZEC + ${formatAmount(wrapFee, BTC_DECIMALS)} BTC`,
    },
  };
}

/**
 * Compute a quote for BTC -> ZEC.
 *
 * Flow: BTC -> (wrap) -> frBTC -> (synth pool) -> frZEC -> (bridge) -> ZEC
 */
export function quoteBtcToZec(
  btcSats: bigint,
  reserves: SynthPoolReserves,
  fees: BridgeFees = DEFAULT_FEES,
): BridgeQuote {
  // Step 1: BTC -> frBTC (wrap, minus fee)
  const wrapFee = (btcSats * BigInt(fees.wrapFeePerMille)) / 1000n;
  const frbtcAmount = btcSats - wrapFee;

  // Step 2: Synth pool swap (frBTC -> frZEC)
  const { amountOut: frzecOut, priceImpact } = computeStableSwap(
    frbtcAmount,
    reserves.frbtcReserve,
    reserves.frusdReserve, // frZEC reserve
    reserves.feePerMille,
  );

  // Step 3: frZEC (8-dec) -> ZEC (8-dec) — 1:1
  const zecAmount = frzecOut * ZEC_TO_FRZEC_FACTOR;

  // Step 4: Protocol fee on ZEC output
  const protocolFee = (zecAmount * BigInt(fees.protocolFeeBps)) / BigInt(BPS_BASE);
  const finalOutput = zecAmount - protocolFee;

  return {
    direction: 'to-stable',
    inputToken: 'BTC',
    outputToken: 'BTC' as StableToken | 'BTC',
    inputAmount: btcSats,
    protocolFee,
    netInputAfterFee: frbtcAmount,
    frUsdAmount: frzecOut, // frZEC amount
    synthPoolOutput: frzecOut,
    finalOutput,
    priceImpact,
    estimatedTimeMinutes: 30,
    feeBreakdown: {
      protocolFee: `${formatAmount(protocolFee, ZEC_DECIMALS)} ZEC (${fees.protocolFeeBps / 100}%)`,
      synthPoolFee: `${reserves.feePerMille / 10}% pool fee`,
      wrapFee: `${formatAmount(wrapFee, BTC_DECIMALS)} BTC (${fees.wrapFeePerMille / 10}% wrap)`,
      totalFees: `~${formatAmount(protocolFee, ZEC_DECIMALS)} ZEC + ${formatAmount(wrapFee, BTC_DECIMALS)} BTC`,
    },
  };
}

export {
  formatAmount,
  computeStableSwap,
  ETH_DECIMALS,
  FRETH_DECIMALS,
  ETH_TO_FRETH_FACTOR,
  ZEC_DECIMALS,
  FRZEC_DECIMALS,
  ZEC_TO_FRZEC_FACTOR,
};
