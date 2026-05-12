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
const BUSD_ID = '2:56801';
const MAINNET_FACTORY_ID = '4:65522';

/**
 * Mainnet alkane id ↔ symbol/name + its direct pool. Each entry pairs
 * the buy-side token with a single pool that contains both that token
 * and a quote token (frBTC by default, or bUSD when `quoteTokenId` is
 * set), so the swap router resolves a one-hop path automatically.
 *
 * For frBTC quote pools the route is BTC → wrap to frBTC → swap. For
 * bUSD quote pools the user must already hold bUSD (or route through
 * the bUSD/frBTC pool — `2:77222`).
 */
export interface CuratedPool {
  /** Pool id (block:tx) — must contain `tokenId` and the quote token. */
  poolId: string;
  /** Alkane id of the non-quote token (the "counterparty" the user buys). */
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
  /**
   * Alkane id of the quote token (token1 in the on-chain pool layout).
   * Defaults to frBTC (`32:0`). Set to bUSD (`2:56801`) for USD-quoted pools.
   */
  quoteTokenId?: string;
  /** Display symbol of the quote token. Defaults to `frBTC`. */
  quoteSymbol?: string;
  /** Display name of the quote token. Defaults to `frBTC`. */
  quoteName?: string;
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
  {
    poolId: '2:77269',
    tokenId: '2:68479',
    symbol: 'TORTILLA',
    name: 'TORTILLA',
    decimals: 8,
  },
  {
    poolId: '2:77222',
    tokenId: BUSD_ID,
    symbol: 'bUSD',
    name: 'bUSD',
    decimals: 8,
  },
  {
    poolId: '2:68441',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: BUSD_ID,
    quoteSymbol: 'bUSD',
    quoteName: 'bUSD',
    lpTokenId: '2:68441',
  },
  {
    poolId: '2:68433',
    tokenId: '2:16',
    symbol: 'METHANE',
    name: 'METHANE',
    decimals: 8,
    quoteTokenId: BUSD_ID,
    quoteSymbol: 'bUSD',
    quoteName: 'bUSD',
    lpTokenId: '2:68433',
  },
  {
    poolId: '2:68497',
    tokenId: '2:69',
    symbol: 'FARTANE',
    name: 'FARTANE',
    decimals: 8,
    quoteTokenId: BUSD_ID,
    quoteSymbol: 'bUSD',
    quoteName: 'bUSD',
    lpTokenId: '2:68497',
  },
  {
    poolId: '2:77221',
    tokenId: '2:16',
    symbol: 'METHANE',
    name: 'METHANE',
    decimals: 8,
    lpTokenId: '2:77221',
  },
  {
    poolId: '2:53014',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:16',
    quoteSymbol: 'METHANE',
    quoteName: 'METHANE',
    lpTokenId: '2:53014',
  },
  {
    poolId: '2:62028',
    tokenId: '2:16',
    symbol: 'METHANE',
    name: 'METHANE',
    decimals: 8,
    quoteTokenId: '2:69',
    quoteSymbol: 'FARTANE',
    quoteName: 'FARTANE',
    lpTokenId: '2:62028',
  },
  {
    poolId: '2:68498',
    tokenId: '2:69',
    symbol: 'FARTANE',
    name: 'FARTANE',
    decimals: 8,
    quoteTokenId: '2:68479',
    quoteSymbol: 'TORTILLA',
    quoteName: 'TORTILLA',
    lpTokenId: '2:68498',
  },
  {
    poolId: '2:57353',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:69',
    quoteSymbol: 'FARTANE',
    quoteName: 'FARTANE',
    lpTokenId: '2:57353',
  },
  {
    poolId: '2:68162',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:35275',
    quoteSymbol: 'DUST',
    quoteName: 'GOLD DUST',
    lpTokenId: '2:68162',
  },
  {
    poolId: '2:62345',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:25720',
    quoteSymbol: 'MIST',
    quoteName: 'ALKAMIST',
    lpTokenId: '2:62345',
  },
  {
    poolId: '2:64006',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '4:0',
    quoteSymbol: 'BAMBOO',
    quoteName: 'BAMBOO',
    lpTokenId: '2:64006',
  },
  {
    poolId: '2:70020',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:68479',
    quoteSymbol: 'TORTILLA',
    quoteName: 'TORTILLA',
    lpTokenId: '2:70020',
  },
  {
    poolId: '2:62044',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:50169',
    quoteSymbol: 'LOVE BOMB',
    quoteName: 'LOVE BOMB',
    lpTokenId: '2:62044',
  },
  {
    poolId: '2:69914',
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    decimals: 8,
    quoteTokenId: '2:490',
    quoteSymbol: 'CheekyB',
    quoteName: 'CheekyB',
    lpTokenId: '2:69914',
  },
  {
    poolId: '2:77355',
    tokenId: '2:77313',
    symbol: 'BB',
    name: 'BB',
    decimals: 8,
    lpTokenId: '2:77355',
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
  return MAINNET_CURATED_POOLS.map((p) => {
    const quoteId = p.quoteTokenId ?? FRBTC_ID;
    const quoteSymbol = p.quoteSymbol ?? 'frBTC';
    const quoteName = p.quoteName ?? 'frBTC';
    return {
      id: p.poolId,
      pairLabel: `${p.symbol} / ${quoteSymbol} LP`,
      token0: {
        id: p.tokenId,
        symbol: p.symbol,
        name: p.name,
      },
      token1: {
        id: quoteId,
        symbol: quoteSymbol,
        name: quoteName,
      },
    } as PoolsListItem;
  });
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
