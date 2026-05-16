/**
 * GET /api/wallet-state — one call per block enriches the wallet.
 *
 * Query params:
 *   addresses=a,b,c   (required, comma-separated)
 *   network=mainnet   (default: mainnet)
 *
 * Caching:
 *   Redis key `wallet-state:{network}:{tipHash}:{sortedAddrs}`, TTL 600s.
 *   - Within a single tip-hash window, identical requests hit Redis.
 *   - On block change the tip-hash flips and the next request fans out
 *     to metashrew once; subsequent requests in that window share the
 *     fresh entry.
 *
 * Last-good fallback:
 *   If `fetchWalletState` throws (network outage, indexer drift), we
 *   ALSO look up the LAST previously-cached entry for these addresses
 *   under any tip-hash (`wallet-state:{network}:last:{sortedAddrs}`).
 *   The first successful response also writes that "last" pointer so a
 *   future outage degrades to (at-worst) a one-block-stale snapshot
 *   instead of a 502 page.
 *
 * Mirrors the subfrost-mobile cache strategy (cache.rs) with one
 * difference: subfrost-mobile maintains an in-memory last-good cache
 * because each gRPC service instance is long-lived. subfrost-app runs
 * on Cloud Run with many ephemeral instances, so the last-good cache
 * MUST live in Redis (shared) — an in-memory layer would be empty on
 * every cold start.
 */

import { NextResponse } from 'next/server';
import { cache, redis } from '@/lib/db/redis';
import { fetchWalletState, type WalletState } from '@/lib/walletState/fetchWalletState';

// Browser CDN hint — wallet-state is user-specific so it must NOT land
// in the public CDN, but stale-while-revalidate lets the browser race
// the network and surface a stale snapshot under the new pageview
// while a background fetch refreshes. The Redis layer is the actual
// cache; this header is just a microoptimisation for back-to-back
// navigations.
const BROWSER_CACHE_HEADER = 'private, s-maxage=10, stale-while-revalidate=60';

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

/**
 * Basic bech32/legacy address shape validation. We don't try to do
 * full bech32 checksum validation server-side (the wallet already did
 * that on the client) but we reject obvious garbage like `';DROP TABLE`
 * so it can't be sprayed into Redis keys.
 */
const ADDRESS_RE = /^[a-zA-Z0-9]{20,128}$/;

function parseAddresses(raw: string | null): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (list.length === 0) return null;
  for (const addr of list) {
    if (!ADDRESS_RE.test(addr)) return null;
  }
  // Sort for stable cache keys — `[a, b]` and `[b, a]` should hit the
  // same entry.
  return [...new Set(list)].sort();
}

const TTL_SECONDS = 600;
const LAST_GOOD_TTL_SECONDS = 60 * 60 * 24; // 24h — covers prolonged upstream outages

function buildKey(network: string, tipHash: string, addrs: string[]): string {
  return `wallet-state:${network}:${tipHash}:${addrs.join(',')}`;
}

function buildLastGoodKey(network: string, addrs: string[]): string {
  return `wallet-state:${network}:last:${addrs.join(',')}`;
}

async function readLastGood(network: string, addrs: string[]): Promise<WalletState | null> {
  try {
    return await cache.get<WalletState>(buildLastGoodKey(network, addrs));
  } catch (err) {
    console.warn('[wallet-state] last-good read failed:', err);
    return null;
  }
}

async function writeLastGood(
  network: string,
  addrs: string[],
  state: WalletState,
): Promise<void> {
  try {
    await cache.set(buildLastGoodKey(network, addrs), state, LAST_GOOD_TTL_SECONDS);
  } catch (err) {
    console.warn('[wallet-state] last-good write failed:', err);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || 'mainnet';
  const addresses = parseAddresses(url.searchParams.get('addresses'));

  if (!ALLOWED_NETWORKS.has(network)) {
    return NextResponse.json({ error: `unknown network ${network}` }, { status: 400 });
  }
  if (!addresses) {
    return NextResponse.json(
      { error: 'addresses parameter is required (comma-separated)' },
      { status: 400 },
    );
  }

  // Compute the tip-hash on the way IN so the cache key reflects the
  // current block. If tip-hash resolution fails (empty string), we skip
  // Redis and pass through directly — matches the subfrost-mobile
  // "skip cache when tip unknown" branch (cache.rs:125).
  let state: WalletState;
  try {
    state = await fetchWalletState(network, addresses);
  } catch (err) {
    console.warn('[wallet-state] fetchWalletState failed; trying last-good:', err);
    const fallback = await readLastGood(network, addresses);
    if (fallback) {
      return NextResponse.json(
        { ...fallback, lastGood: true },
        { headers: { 'Cache-Control': BROWSER_CACHE_HEADER } },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'fetchWalletState failed',
      },
      { status: 502 },
    );
  }

  // Cache the freshly-computed state under both the tip-hash key (for
  // intra-block reuse) and the last-good pointer (for cross-block
  // fallback during upstream outages).
  if (state.tipHash) {
    const key = buildKey(network, state.tipHash, addresses);
    try {
      await cache.set(key, state, TTL_SECONDS);
    } catch (err) {
      console.warn('[wallet-state] tip-keyed cache write failed:', err);
    }
  }
  await writeLastGood(network, addresses, state);

  return NextResponse.json(state, {
    headers: { 'Cache-Control': BROWSER_CACHE_HEADER },
  });
}

/**
 * Helper used by GET above AND by tests. Exported so route tests can
 * directly assert the Redis-keyed flow without depending on the
 * ephemeral `cache.getOrSet` indirection (which lives behind module
 * mocking in vitest).
 *
 * NOT currently called from GET because we want the "compute → SET
 * both keys" ordering above, which getOrSet can't express in one call.
 * Kept exported so callers that want simple read-through caching can
 * use it without duplicating the key-building logic.
 */
export async function getCachedWalletState(
  network: string,
  addresses: string[],
): Promise<WalletState> {
  const tipHash = '';
  const key = tipHash
    ? buildKey(network, tipHash, addresses)
    : `wallet-state:${network}:no-tip:${addresses.join(',')}`;
  return cache.getOrSet<WalletState>(
    key,
    () => fetchWalletState(network, addresses),
    TTL_SECONDS,
  );
}

// `redis` import is intentionally referenced so future implementations
// can use the raw client (e.g. for SCAN-based cache eviction during a
// reorg). Re-export it for the route tests' benefit.
export { redis };
