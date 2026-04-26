'use client';

/**
 * Height-based polling — the SINGLE source of query invalidation.
 *
 * HeightPoller is a headless component that:
 *   1. Polls block height every 10s using SDK provider (espoGetHeight or metashrewGetHeight)
 *   2. Falls back to raw metashrew_height RPC if SDK not yet initialized
 *   3. When the height changes, invalidates ALL other queries.
 *
 * Every other query uses `staleTime: Infinity` and never self-refreshes.
 *
 * JOURNAL ENTRY (2026-02-11): Migrated from raw metashrew_height RPC to SDK
 * espoGetHeight/dataApiGetBlockHeight with fallback. Moved HeightPoller inside
 * AlkanesSDKProvider in providers.tsx so it can access the SDK context.
 */

import { useEffect, useRef } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getRpcUrl } from '@/utils/getConfig';
import { queryKeys } from './keys';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// ---------------------------------------------------------------------------
// Query options factory
// ---------------------------------------------------------------------------

async function fetchHeightViaSDK(provider: WebProvider): Promise<number> {
  // Try espoGetHeight first (Espo service), then dataApiGetBlockHeight, then metashrewGetHeight
  try {
    const height = await provider.espoGetHeight();
    if (typeof height === 'number' && height > 0) return height;
  } catch { /* fall through */ }

  try {
    const result = await provider.dataApiGetBlockHeight();
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const h = parsed?.height ?? parsed?.data?.height ?? parsed;
    if (typeof h === 'number' && h > 0) return h;
  } catch { /* fall through */ }

  try {
    const result = await provider.metashrewHeight();
    const h = typeof result === 'number' ? result : parseInt(String(result), 10);
    if (h > 0) return h;
  } catch { /* fall through */ }

  throw new Error('All SDK height methods failed');
}

async function fetchHeightViaRPC(network: string): Promise<number> {
  const rpcUrl = getRpcUrl(network);

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'metashrew_height',
      params: [],
      id: 1,
    }),
  });
  const json = await res.json();
  const result = json.result;
  return typeof result === 'number' ? result : (typeof result === 'string' ? parseInt(result, 10) || 0 : 0);
}

export function espoHeightQueryOptions(network: string, provider?: WebProvider | null) {
  return queryOptions({
    queryKey: queryKeys.height.espo(network),
    queryFn: async () => {
      // Prefer SDK provider when available
      if (provider) {
        try {
          return await fetchHeightViaSDK(provider);
        } catch {
          // Fall back to raw RPC
        }
      }
      return fetchHeightViaRPC(network);
    },
    // This is the ONE query that polls
    refetchInterval: 10_000,
    staleTime: 8_000,
  });
}

// ---------------------------------------------------------------------------
// HeightPoller component
// ---------------------------------------------------------------------------

const HEIGHT_STORAGE_KEY = 'subfrost_last_block_height';

export function HeightPoller({ network }: { network: string }) {
  const queryClient = useQueryClient();
  const storedHeight = typeof window !== 'undefined'
    ? parseInt(localStorage.getItem(HEIGHT_STORAGE_KEY) || '0', 10) || null
    : null;
  const prevHeight = useRef<number | null>(storedHeight);
  const { provider } = useAlkanesSDK();

  const { data: height } = useQuery(espoHeightQueryOptions(network, provider));

  useEffect(() => {
    if (height == null || height === 0) return; // height 0 = RPC error, not real

    // First poll result — compare with stored height from localStorage.
    // If height hasn't changed since last visit, skip initial invalidation
    // to avoid duplicate queries (queries already running from mount).
    if (prevHeight.current === null || prevHeight.current === storedHeight) {
      if (prevHeight.current !== null && height <= prevHeight.current) {
        // Same or lower height — no new block, just record and skip
        console.log(`[HeightPoller] Initial height: ${height} (stored: ${prevHeight.current}), skipping invalidation`);
        prevHeight.current = height;
        return;
      }
      // Either first time ever (null) or new block since last visit
      console.log(`[HeightPoller] Initial height: ${height} (stored: ${prevHeight.current}), invalidating`);
      prevHeight.current = height;
      if (typeof window !== 'undefined') localStorage.setItem(HEIGHT_STORAGE_KEY, String(height));
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key)) return true;
          if (key[0] === 'height') return false;
          if (key[0] === 'frbtc-premium') return false;
          // Token names/symbols are immutable — no need to refetch on new block
          if (key[0] === 'token-display') return false;
          return true;
        },
      });
      return;
    }

    // Height increased → invalidate everything EXCEPT height and slow-changing queries.
    // Only react to increases — Espo load-balances across nodes at different sync
    // heights, causing oscillation (e.g. 870001 → 870000 → 870001) that would
    // otherwise trigger spurious invalidations every poll cycle.
    if (height > prevHeight.current) {
      console.log(
        `[HeightPoller] Height changed ${prevHeight.current} → ${height}, invalidating queries`,
      );
      prevHeight.current = height;
      if (typeof window !== 'undefined') localStorage.setItem(HEIGHT_STORAGE_KEY, String(height));

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          if (!Array.isArray(key)) return true;
          // Don't invalidate the height query itself
          if (key[0] === 'height') return false;
          // frBTC premium is a contract config that rarely changes — no need
          // to re-simulate on every block.
          if (key[0] === 'frbtc-premium') return false;
          // Token names/symbols are immutable — no need to refetch on new block
          if (key[0] === 'token-display') return false;
          return true;
        },
      });
    }
  }, [height, queryClient]);

  return null;
}
