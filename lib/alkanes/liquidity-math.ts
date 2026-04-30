/**
 * Math helpers for the AddLiquidity UI.
 *
 * Pure: no React, no hooks. Easy to unit test.
 */
import BigNumber from 'bignumber.js';

export interface PairedAmountInput {
  /** Display value typed by the user (e.g. "1.5"). */
  typedDisplay: string;
  /** Which side received the input — 0 = left, 1 = right. */
  typedSide: 0 | 1;
  /** UI side 0 token id (e.g. "2:0" or "btc"). */
  uiToken0Id: string;
  /** UI side 1 token id. */
  uiToken1Id: string;
  /** Pool's natural token0 id (on-chain order, fixed at pool creation). */
  poolToken0Id: string;
  /** Reserve of pool.token0 in raw 1e8 sub-units. */
  reserve0: string;
  /** Reserve of pool.token1 in raw 1e8 sub-units. */
  reserve1: string;
  /** frBTC alkane id (e.g. "32:0") — used for BTC↔frBTC equivalence. */
  frbtcId: string;
  /** Wrap fee per 1000 (e.g. 5 = 0.5%). */
  wrapFeePerThousand: number;
}

/**
 * Compute the paired LP amount that matches the live pool ratio.
 *
 * Returns null if inputs are invalid (no reserves, no amount, etc) — caller
 * should leave the paired input unchanged in that case.
 *
 * Handles two non-trivial cases:
 *   1. UI side may be flipped relative to pool's natural order. We compare
 *      token IDs to detect alignment (BTC treated as frBTC for matching).
 *   2. BTC inputs need wrap-fee adjustment: the user types BTC but the pool
 *      sees post-wrap frBTC. Multiply by (1 - wrapFee) on the way in,
 *      divide on the way out.
 */
export function computePairedLpAmount(input: PairedAmountInput): string | null {
  const r0 = new BigNumber(input.reserve0);
  const r1 = new BigNumber(input.reserve1);
  if (r0.lte(0) || r1.lte(0)) return null;

  const typed = new BigNumber(input.typedDisplay);
  if (!typed.isFinite() || typed.lte(0)) return null;

  const equivalentId = (id: string) => (id === 'btc' ? input.frbtcId : id);
  const ourSide0 = equivalentId(input.uiToken0Id);
  const poolSide0 = equivalentId(input.poolToken0Id);
  const sidesAligned = ourSide0 === poolSide0;

  const wrapMul = new BigNumber(1000 - input.wrapFeePerThousand).dividedBy(1000);
  const isTypedBtc = (input.typedSide === 0 ? input.uiToken0Id : input.uiToken1Id) === 'btc';
  const isPairedBtc = (input.typedSide === 0 ? input.uiToken1Id : input.uiToken0Id) === 'btc';

  const typedRaw = typed.multipliedBy(1e8);
  const typedFrbtcEquiv = isTypedBtc ? typedRaw.multipliedBy(wrapMul) : typedRaw;

  const typedReserve = (input.typedSide === 0) === sidesAligned ? r0 : r1;
  const pairedReserve = (input.typedSide === 0) === sidesAligned ? r1 : r0;

  const pairedFrbtcEquiv = typedFrbtcEquiv.multipliedBy(pairedReserve).dividedBy(typedReserve);
  const pairedRaw = isPairedBtc ? pairedFrbtcEquiv.dividedBy(wrapMul) : pairedFrbtcEquiv;
  return pairedRaw.dividedBy(1e8).toFixed(8).replace(/\.?0+$/, '');
}
