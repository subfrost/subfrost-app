/**
 * Curated mainnet pool list — fully static, NO runtime discovery.
 *
 * Per flex (alkanes-rs maintainer, 2026-05-11):
 *   "There shouldn't be a pool discovery phase at all"
 *   "We have hardcoded pools in there now" — "Right"
 *   "Even if we didn't, that's the migration from subfrost api to espo we
 *    maybe haven't done yet"
 *
 * Implementation rules:
 *   - The pool list is a TypeScript constant. It does not depend on any
 *     network call to enumerate. usePools / useSwapQuotes can synchronously
 *     ask "what pools exist?" and get an answer in zero ms with zero
 *     failure modes.
 *   - Each entry encodes everything the UI needs to find the pool: the
 *     pool's alkane id, the non-frBTC token's alkane id, display strings,
 *     and the LP-token alkane id (for wallet enumeration).
 *   - Live RESERVES are still fetched on-demand by the swap quote engine
 *     (`fetchLivePoolState` / `usePoolStateLive`) — that's a different
 *     concern (price math), not pool discovery. Reserves change every
 *     block; pool existence does not.
 *   - To add a pool: append an entry below. To remove a pool: delete an
 *     entry. Never write code that "discovers" pools at runtime.
 *
 * Pool IDs were captured from a live mainnet `factory.GetAllPools` query
 * on 2026-05-03 against block 947661 and stay valid forever — pools are
 * immutable on-chain.
 */

import type { PoolsListItem } from '@/hooks/usePools';

const FRBTC_ID = '32:0';
const MAINNET_FACTORY_ID = '4:65522';

/**
 * Mainnet alkane id ↔ symbol/name + its direct frBTC pool. Each entry
 * pairs the buy-side token with a single pool that contains both that
 * token and frBTC, so the swap router resolves a one-hop path
 * automatically (BTC → wrap to frBTC → swap to target).
 */
export interface CuratedPool {
  /** Pool id (block:tx) — must contain `tokenId` and frBTC (32:0). */
  poolId: string;
  /** Alkane id of the non-frBTC token (the "counterparty" the user buys). */
  tokenId: string;
  /** Display symbol. */
  symbol: string;
  /** Display name. */
  name: string;
  /** Token decimals (8 for all known mainnet alkanes today). */
  decimals: number;
  /**
   * Alkane id of the LP token issued by this pool (for wallet enumeration —
   * lets the wallet card recognize "this dust outpoint is an LP receipt"
   * without needing to call the pool contract).
   */
  lpTokenId?: string;
}

export const MAINNET_CURATED_POOLS: readonly CuratedPool[] = [
  {
    poolId: '2:77087',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
  },
  {
    poolId: '2:77237',
    tokenId: '2:25720',
    symbol: 'MIST',
    name: 'ALKAMIST',
    decimals: 8,
  },
  {
    poolId: '2:77220',
    tokenId: '2:590',
    symbol: '🐝',
    name: 'Bee',
    decimals: 8,
  },
  {
    poolId: '2:77228',
    tokenId: '2:35275',
    symbol: 'DUST',
    name: 'GOLD DUST',
    decimals: 8,
  },
] as const;

/**
 * Convert the static curated list to `PoolsListItem[]` for `usePools`
 * consumers (TrendingPairs, MarketsGrid, useSwapQuotes' `directPool`
 * lookup, etc.). Synchronous — no fetch, no Promise, no failure modes.
 *
 * Reserves (`token0Amount`, `token1Amount`), TVL, volume, APR are
 * intentionally undefined here. The swap quote engine fetches live
 * reserves separately via `usePoolStateLive` (opcode-999 simulate).
 * Display surfaces (TrendingPairs, MarketsGrid TVL columns) overlay
 * those values from `useAllPoolStats` when available.
 *
 * Each pool's `token0` / `token1` ordering matches the on-chain pool's
 * canonical layout — for the curated set, frBTC was always slot 1
 * (token1) at deployment. Verified via curl 2026-05-11.
 */
export function getCuratedPoolsListItems(): PoolsListItem[] {
  return MAINNET_CURATED_POOLS.map((p) => ({
    id: p.poolId,
    pairLabel: `${p.symbol} / frBTC LP`,
    token0: {
      id: p.tokenId,
      symbol: p.symbol,
      name: p.name,
    },
    token1: {
      id: FRBTC_ID,
      symbol: 'frBTC',
      name: 'frBTC',
    },
  } as PoolsListItem));
}

/** Mainnet factory alkane id (the AMM router). */
export const CURATED_FACTORY_ID = MAINNET_FACTORY_ID;

/**
 * Set of curated token ids — used by the swap UI to decide whether a
 * token should be allowed in the BTC-side receive list when no other
 * pool source has surfaced it.
 */
export const CURATED_TOKEN_IDS: ReadonlySet<string> = new Set(
  MAINNET_CURATED_POOLS.map((p) => p.tokenId),
);

/** Set of curated pool ids. */
export const CURATED_POOL_IDS: ReadonlySet<string> = new Set(
  MAINNET_CURATED_POOLS.map((p) => p.poolId),
);

/**
 * BACKWARD COMPAT: legacy export name preserved for callers that
 * imported `fetchCuratedPoolsListItems`. Now synchronous-wrapped-in-Promise
 * (no actual fetch). Migrate callers to `getCuratedPoolsListItems` over time.
 */
export async function fetchCuratedPoolsListItems(
  _rpcUrl?: string,
): Promise<PoolsListItem[]> {
  return getCuratedPoolsListItems();
}
