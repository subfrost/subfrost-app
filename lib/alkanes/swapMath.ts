/**
 * Pure Uniswap-V2 constant-product helpers shared between quote calculation
 * (`useSwapQuotes`) and pre-submit recomputation (`useSwapMutation`).
 *
 * Identical formula to factory opcode 13 — keep this file in sync with
 * `oyl-amm/alkanes/factory/src/lib.rs` swap math if pool fee semantics ever
 * change (currently `feePercentage` is fee-per-1 i.e. 0.003 for 0.3%).
 */

export function swapCalculateOut({
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
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn + amountInWithFee;
  return Math.floor(numerator / denominator);
}

export function swapCalculateIn({
  amountOut,
  reserveIn,
  reserveOut,
  feePercentage,
}: {
  amountOut: number;
  reserveIn: number;
  reserveOut: number;
  feePercentage: number;
}): number {
  if (amountOut <= 0) throw new Error('INSUFFICIENT_OUTPUT_AMOUNT');
  if (reserveIn <= 0 || reserveOut <= 0) throw new Error('INSUFFICIENT_LIQUIDITY');
  if (amountOut >= reserveOut) throw new Error('INSUFFICIENT_LIQUIDITY');
  const amountInWithFee = (amountOut * reserveIn) / (reserveOut - amountOut);
  const amountIn = amountInWithFee / (1 - feePercentage);
  return Math.ceil(amountIn);
}
