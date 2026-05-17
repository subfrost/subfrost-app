/**
 * Server-side tip-hash watcher for wallet/pool-state cache keys.
 *
 * Mirrors the subfrost-mobile `tip_watcher` (cache.rs) but as an
 * on-demand resolver instead of a long-running task: every cache build
 * calls `getCurrentTipHash(network)` and the call is debounced to 5s.
 * Inside that window the cached value is returned without a re-fetch
 * (avoids hammering metashrew on bursty wallet-state hits).
 *
 * Why a tip hash instead of a height: heights are reorg-ambiguous (two
 * different chains can share a height number). The blockhash is unique
 * per chain segment, so keying cache entries by tip hash gives us
 * correctness-by-construction across reorgs — a reorg produces a
 * different tip hash, every cache key under the old prefix becomes
 * unreachable, and Redis LRU reclaims the orphans.
 *
 * Empty-string return = tip unknown. Callers should treat that as a
 * cache miss and bypass storage for that request.
 */

import { getRpcUrl } from '@/utils/getConfig';

interface TipHashCacheEntry {
  value: string;
  updatedAt: number;
}

const TIP_HASH_TTL_MS = 5_000;

const tipHashCache = new Map<string, TipHashCacheEntry>();

/**
 * Test-only escape hatch — clears the in-memory cache so a unit test
 * can assert the cache-miss → fetch → cache-hit transition without
 * waiting 5s of wall-clock time.
 */
export function __resetTipHashCacheForTests(): void {
  tipHashCache.clear();
}

async function metashrewHeight(network: string): Promise<number> {
  const res = await fetch(getRpcUrl(network), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'metashrew_height',
      params: [],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`metashrew_height HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `metashrew_height RPC error: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }
  return Number(json.result);
}

async function metashrewBlockHash(network: string, height: number): Promise<string> {
  const res = await fetch(getRpcUrl(network), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'metashrew_getblockhash',
      params: [height],
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`metashrew_getblockhash HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) {
    throw new Error(
      `metashrew_getblockhash RPC error: ${json.error.message ?? JSON.stringify(json.error)}`,
    );
  }
  const hash = String(json.result ?? '');
  return hash.startsWith('0x') ? hash.slice(2) : hash;
}

/**
 * Fetch the current tip hash for the network and update the cache.
 * Skips the cache TTL — always re-fetches. Most callers should use
 * `getCurrentTipHash` instead.
 *
 * Returns `''` on failure so callers can detect "tip unknown" without
 * a try/catch.
 */
export async function refreshTipHash(network: string): Promise<string> {
  try {
    const height = await metashrewHeight(network);
    if (!Number.isFinite(height) || height <= 0) {
      console.warn(`[tipHash] invalid metashrew_height for ${network}:`, height);
      return '';
    }
    const hash = await metashrewBlockHash(network, height);
    if (!hash) {
      console.warn(`[tipHash] empty getblockhash response for ${network}@${height}`);
      return '';
    }
    tipHashCache.set(network, { value: hash, updatedAt: Date.now() });
    return hash;
  } catch (err) {
    console.warn(`[tipHash] refresh failed for ${network}:`, err);
    return '';
  }
}

/**
 * Returns the current cached tip hash for the network, refreshing if
 * the cache entry is older than 5s. Empty string = tip unknown.
 *
 * Used as the cache-key suffix in `wallet-state:{net}:{tip}:{addrs}`
 * and `pool-state:{net}:{tip}:{poolId}`. Within a single block the
 * hash is stable so identical requests hit Redis; on block change the
 * key prefix rotates and the new tip's first request fans out to
 * metashrew (which is the desired "one RPC fanout per block" property).
 */
export async function getCurrentTipHash(network: string): Promise<string> {
  const entry = tipHashCache.get(network);
  if (entry && Date.now() - entry.updatedAt < TIP_HASH_TTL_MS) {
    return entry.value;
  }
  return refreshTipHash(network);
}

