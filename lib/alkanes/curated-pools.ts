/**
 * Curated mainnet pool list — known good IDs verified on-chain.
 *
 * The espo `/get-all-pools-details` and `/get-all-token-pairs` endpoints have
 * been returning empty on mainnet for an extended period (see audit
 * 2026-05-02 + bug report 2026-05-03). The SDK's
 * `alkanesGetAllPoolsWithDetails` fallback also misses several pools.
 * Without a pool list, the swap form's "Select Token to Receive" modal
 * filters out every BTC-paired token because no pool matches BTC's
 * counterparty (frBTC).
 *
 * This module hardcodes the mainnet pool IDs we want to surface in the
 * UI, fetches their *live* reserves directly via metashrew_view simulate
 * (opcode 999 PoolDetails), and assembles a `PoolsListItem[]` shaped
 * identically to what `usePools` returns from the espo path. Plug it in
 * as a high-priority data source and the swap/LP forms light up
 * immediately.
 *
 * Pool IDs were captured from a live mainnet `factory.GetAllPools` query
 * on 2026-05-03 against block 947661. They are stable: pools cannot be
 * renamed or moved, so as long as the AMM factory at 4:65522 keeps
 * returning these pools they remain valid.
 *
 * Multi-hop tokens (BUTANE, CheekyB) don't have direct frBTC pools yet;
 * they're listed here so the UI can route through the explicit hop. The
 * `route` field describes the path: pool IDs ordered along the swap
 * direction starting from the BTC side. The swap engine consumes this
 * via factory opcode 13 (SwapExactTokensForTokens) which already accepts
 * a `path: Vec<AlkaneId>`.
 */

import type { PoolsListItem } from '@/hooks/usePools';
import { simulateContract, extractField3Data, parseU128LE } from '@/lib/fujin/rpc';

/**
 * Mainnet alkane id ↔ symbol/name + the direct frBTC pool, plus 2-hop
 * routes for tokens whose pool with frBTC doesn't (yet) exist.
 *
 * `route` is the ordered pool path *starting from frBTC* (i.e. the user
 * spends BTC → wraps to frBTC → swaps along this chain). For direct
 * pools the route is a single pool. For multi-hop the route is multiple
 * pools chained by shared tokens — the swap router walks them.
 */
export interface CuratedPool {
  /** Alkane id of the non-frBTC token (the "counterparty" the user buys). */
  tokenId: string;
  /** Display symbol (matches the contract's GET_SYMBOL output). */
  symbol: string;
  /** Display name. */
  name: string;
  /**
   * Ordered pool path. First pool always contains frBTC (32:0); subsequent
   * pools share a token with the previous pool. For direct pairs this is
   * one pool; for multi-hop (e.g. BUTANE) it's two or more.
   */
  route: Array<{
    poolId: string;
    /** The token alkane id this hop ends with. The next hop's pool must contain it. */
    outTokenId: string;
  }>;
}

export const MAINNET_CURATED_POOLS: readonly CuratedPool[] = [
  {
    tokenId: '2:0',
    symbol: 'DIESEL',
    name: 'DIESEL',
    route: [{ poolId: '2:77087', outTokenId: '2:0' }],
  },
  {
    tokenId: '2:25720',
    symbol: 'MIST',
    name: 'ALKAMIST',
    route: [{ poolId: '2:77237', outTokenId: '2:25720' }],
  },
  {
    tokenId: '2:590',
    symbol: '🐝',
    name: 'Bee',
    route: [{ poolId: '2:77220', outTokenId: '2:590' }],
  },
  {
    tokenId: '2:35275',
    symbol: 'DUST',
    name: 'GOLD DUST',
    route: [{ poolId: '2:77228', outTokenId: '2:35275' }],
  },
  {
    // CheekyB has no direct frBTC pool. Route through DIESEL/CheekyB.
    tokenId: '2:490',
    symbol: 'CKB',
    name: 'CheekyB',
    route: [
      { poolId: '2:77087', outTokenId: '2:0' },     // frBTC → DIESEL
      { poolId: '2:69914', outTokenId: '2:490' },   // DIESEL → CheekyB
    ],
  },
  {
    // BUTANE has no direct frBTC pool. Route through ALKAMIST/BUTANE.
    tokenId: '2:19',
    symbol: 'C4H10',
    name: 'BUTANE',
    route: [
      { poolId: '2:77237', outTokenId: '2:25720' }, // frBTC → ALKAMIST
      { poolId: '2:70358', outTokenId: '2:19' },    // ALKAMIST → BUTANE
    ],
  },
] as const;

const FRBTC_ID = '32:0';

/** Decode a u32 LE from a hex string at a hex-character offset. */
function parseU32LE(hexData: string, offset: number): number {
  const bytes = hexData.slice(offset, offset + 8);
  if (bytes.length !== 8) return 0;
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const byte = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    if (!isNaN(byte)) value |= byte << (i * 8);
  }
  return value >>> 0;
}

function hexToUtf8(hex: string): string {
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(byte) || byte === 0) break;
    out += String.fromCharCode(byte);
  }
  return out;
}

/**
 * Live reserves for a single curated pool. Calls the pool contract
 * directly via metashrew_view simulate opcode 999 (PoolDetails) — same
 * mechanism poolState.ts uses for swap quote inputs, so reserves are
 * always consistent with what the factory contract sees at submit time.
 */
export interface CuratedPoolDetails {
  poolId: string;
  token0Id: string;
  token1Id: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  name: string;
}

async function fetchCuratedPoolDetails(
  rpcUrl: string,
  poolId: string,
): Promise<CuratedPoolDetails | null> {
  let detailsHex: string;
  try {
    detailsHex = await simulateContract(rpcUrl, poolId, 999);
  } catch (err) {
    console.warn(`[curated-pools] opcode-999 failed for ${poolId}:`, err);
    return null;
  }
  const poolInfo = extractField3Data(detailsHex, 116);
  if (!poolInfo || poolInfo.length < 232) return null;

  const token0Block = parseU128LE(poolInfo, 0);
  const token0Tx = parseU128LE(poolInfo, 32);
  const token1Block = parseU128LE(poolInfo, 64);
  const token1Tx = parseU128LE(poolInfo, 96);
  const reserve0 = parseU128LE(poolInfo, 128);
  const reserve1 = parseU128LE(poolInfo, 160);
  const totalSupply = parseU128LE(poolInfo, 192);
  const nameLength = parseU32LE(poolInfo, 224);
  const nameStart = 232;
  const nameEnd = Math.min(nameStart + nameLength * 2, poolInfo.length);
  const name = hexToUtf8(poolInfo.slice(nameStart, nameEnd));

  return {
    poolId,
    token0Id: `${token0Block}:${token0Tx}`,
    token1Id: `${token1Block}:${token1Tx}`,
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString(),
    totalSupply: totalSupply.toString(),
    name,
  };
}

/**
 * Render the curated list as `PoolsListItem[]` so it slots into the
 * existing `usePools` consumer surface (same shape `useAlkanesTokenPairs`
 * etc. already consume from the espo path). Only the *direct* frBTC
 * pools become PoolsListItem entries — multi-hop tokens (CheekyB,
 * BUTANE) don't have their own frBTC pool and need separate routing in
 * the swap quote engine.
 *
 * Promise.all-fetches reserves for every direct pool in parallel; takes
 * ~100-200ms on warm metashrew. If any individual pool fetch fails it's
 * skipped (logged) — the rest still surface.
 */
export async function fetchCuratedPoolsListItems(
  rpcUrl: string,
): Promise<PoolsListItem[]> {
  const direct = MAINNET_CURATED_POOLS.filter((p) => p.route.length === 1);

  const detailsList = await Promise.all(
    direct.map((p) => fetchCuratedPoolDetails(rpcUrl, p.route[0].poolId)),
  );

  const items: PoolsListItem[] = [];
  for (let i = 0; i < direct.length; i++) {
    const curated = direct[i];
    const details = detailsList[i];
    if (!details) continue;

    // Map token0 / token1 from on-chain so we don't drift if the pool
    // was created with frBTC in the opposite slot.
    const tokenSide =
      details.token0Id === curated.tokenId ? 'token0' : 'token1';
    const frBtcSide = tokenSide === 'token0' ? 'token1' : 'token0';

    items.push({
      id: details.poolId,
      pairLabel: `${curated.symbol}/frBTC`,
      token0: {
        id: details.token0Id,
        symbol: tokenSide === 'token0' ? curated.symbol : 'frBTC',
        name: tokenSide === 'token0' ? curated.name : 'frBTC',
      },
      token1: {
        id: details.token1Id,
        symbol: frBtcSide === 'token0' ? curated.symbol : 'frBTC',
        name: frBtcSide === 'token0' ? curated.name : 'frBTC',
      },
      token0Amount:
        tokenSide === 'token0' ? details.reserve0 : details.reserve1,
      token1Amount:
        frBtcSide === 'token0' ? details.reserve0 : details.reserve1,
      // Intentionally leave tvlUsd undefined — real TVL is overlaid from
      // /api/pools/stats (poolStats in SwapShell.tsx) when available. The
      // upstream low-TVL filter in usePools.ts is patched to keep entries
      // with no explicit TVL data so the curated set survives.
    } as PoolsListItem);
  }

  return items;
}

/**
 * Multi-hop routes (CheekyB, BUTANE). The swap engine should consume
 * these for path-style swaps via factory opcode 13. Returned in the
 * shape: { sellTokenId: 'btc'/frBTC, buyTokenId, path: [tokenIds in
 * order] } so the quote builder can derive amounts from each hop's
 * reserves.
 */
export function getCuratedMultiHopRoutes(): Array<{
  buyTokenId: string;
  symbol: string;
  name: string;
  path: string[];
  poolIds: string[];
}> {
  return MAINNET_CURATED_POOLS
    .filter((p) => p.route.length > 1)
    .map((p) => ({
      buyTokenId: p.tokenId,
      symbol: p.symbol,
      name: p.name,
      path: [FRBTC_ID, ...p.route.map((hop) => hop.outTokenId)],
      poolIds: p.route.map((hop) => hop.poolId),
    }));
}

/**
 * Set of curated token ids — used by the swap UI to decide whether a
 * token should be allowed in the BTC-side receive list when no other
 * pool source has surfaced it.
 */
export const CURATED_TOKEN_IDS: ReadonlySet<string> = new Set(
  MAINNET_CURATED_POOLS.map((p) => p.tokenId),
);
