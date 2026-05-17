/**
 * GET /api/pool-state/[poolId]?network=mainnet
 *
 * Returns live pool reserves + LP supply via metashrew opcode 999
 * (PoolDetails). Cached in Redis under
 * `pool-state:{network}:{tipHash}:{poolId}`, TTL 600s.
 *
 * Why a dedicated route instead of the existing usePoolStateLive
 * client-side simulate call: every connected client computing its own
 * slippage quote in parallel fans out an identical simulate per pool
 * per block. Routing through Redis collapses N concurrent clients to
 * one upstream call per (block, pool). The simulate latency dominates
 * the swap-quote critical path (~250-500ms p99 on mainnet) so this
 * tail-latency win is the load-bearing reason this route exists.
 *
 * Last-good fallback mirrors the wallet-state route: on upstream
 * failure we serve the previous block's snapshot rather than 502.
 * `useSwapQuotes` slippage math is OK with a one-block-stale reserve
 * (Uniswap-style "revert if price moved too far" handles the actual
 * MEV protection).
 */

import { NextResponse } from 'next/server';
import { cache } from '@/lib/db/redis';
import { fetchPoolState, type PoolState } from '@/lib/walletState/fetchPoolState';

const BROWSER_CACHE_HEADER = 'private, s-maxage=10, stale-while-revalidate=60';
const TTL_SECONDS = 600;
const LAST_GOOD_TTL_SECONDS = 60 * 60 * 24;

const ALLOWED_NETWORKS = new Set([
  'mainnet',
  'testnet',
  'signet',
  'regtest',
  'regtest-local',
  'subfrost-regtest',
  'qubitcoin-regtest',
  'oylnet',
]);

const POOL_ID_RE = /^\d+:\d+$/;

function buildKey(network: string, tipHash: string, poolId: string): string {
  return `pool-state:${network}:${tipHash}:${poolId}`;
}

function buildLastGoodKey(network: string, poolId: string): string {
  return `pool-state:${network}:last:${poolId}`;
}

async function readLastGood(network: string, poolId: string): Promise<PoolState | null> {
  try {
    return await cache.get<PoolState>(buildLastGoodKey(network, poolId));
  } catch (err) {
    console.warn('[pool-state] last-good read failed:', err);
    return null;
  }
}

async function writeLastGood(
  network: string,
  poolId: string,
  state: PoolState,
): Promise<void> {
  try {
    await cache.set(buildLastGoodKey(network, poolId), state, LAST_GOOD_TTL_SECONDS);
  } catch (err) {
    console.warn('[pool-state] last-good write failed:', err);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ poolId: string }> | { poolId: string } },
): Promise<NextResponse> {
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || 'mainnet';
  // Next 15 turned `params` into a Promise — handle both shapes so the
  // route works under both 14.x and 15.x without a peer-dep bump.
  const resolved = await Promise.resolve(params);
  const poolId = resolved.poolId;

  if (!ALLOWED_NETWORKS.has(network)) {
    return NextResponse.json({ error: `unknown network ${network}` }, { status: 400 });
  }
  if (!poolId || !POOL_ID_RE.test(poolId)) {
    return NextResponse.json(
      { error: 'poolId must be of the form "block:tx"' },
      { status: 400 },
    );
  }

  let state: PoolState | null;
  try {
    state = await fetchPoolState(network, poolId);
  } catch (err) {
    console.warn('[pool-state] fetchPoolState threw; trying last-good:', err);
    const fallback = await readLastGood(network, poolId);
    if (fallback) {
      return NextResponse.json(
        { ...fallback, lastGood: true },
        { headers: { 'Cache-Control': BROWSER_CACHE_HEADER } },
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'fetchPoolState failed' },
      { status: 502 },
    );
  }

  if (!state) {
    // fetchPoolState returned null (simulate failed gracefully or
    // payload shape was wrong). Try last-good before reporting empty
    // — same reason as the throw branch above.
    const fallback = await readLastGood(network, poolId);
    if (fallback) {
      return NextResponse.json(
        { ...fallback, lastGood: true },
        { headers: { 'Cache-Control': BROWSER_CACHE_HEADER } },
      );
    }
    return NextResponse.json(
      { error: `pool ${poolId} state not available` },
      { status: 502 },
    );
  }

  if (state.tipHash) {
    const key = buildKey(network, state.tipHash, poolId);
    try {
      await cache.set(key, state, TTL_SECONDS);
    } catch (err) {
      console.warn('[pool-state] tip-keyed cache write failed:', err);
    }
  }
  await writeLastGood(network, poolId, state);

  return NextResponse.json(state, {
    headers: { 'Cache-Control': BROWSER_CACHE_HEADER },
  });
}
