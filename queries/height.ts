'use client';

/**
 * Height-based polling — the SINGLE source of query invalidation.
 *
 * HeightPoller is a headless component that:
 *   1. Polls block height every 10s using SDK provider (espoGetHeight or metashrewGetHeight)
 *   2. Falls back to esplora blocks/tip/height if SDK not yet initialized
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

/**
 * Bootstrap-only fallback: fetches block tip height via esplora proxy BEFORE SDK
 * initializes. This is the ONE acceptable non-SDK fetch in the app — it fires only
 * during the brief window before WebProvider is ready.
 */
async function fetchHeightViaEsplora(network: string): Promise<number> {
  const res = await fetch(`/api/esplora/blocks/tip/height?network=${encodeURIComponent(network)}`);
  if (!res.ok) throw new Error(`Esplora tip height failed: ${res.status}`);
  const text = await res.text();
  const height = parseInt(text, 10);
  if (isNaN(height) || height <= 0) throw new Error(`Invalid height: ${text}`);
  return height;
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
      return fetchHeightViaEsplora(network);
    },
    // This is the ONE query that polls
    refetchInterval: 10_000,
    staleTime: 8_000,
  });
}

// ---------------------------------------------------------------------------
// HeightPoller component
// ---------------------------------------------------------------------------

export function HeightPoller({ network }: { network: string }) {
  const queryClient = useQueryClient();
  const prevHeight = useRef<number | null>(null);
  const { provider } = useAlkanesSDK();

  const { data: height } = useQuery(espoHeightQueryOptions(network, provider));

  useEffect(() => {
    if (height == null) return;

    // First mount — just record the height, don't invalidate
    if (prevHeight.current === null) {
      prevHeight.current = height;
      return;
    }

    // Height changed → invalidate everything EXCEPT the height query itself
    if (height !== prevHeight.current) {
      console.log(
        `[HeightPoller] Height changed ${prevHeight.current} → ${height}, invalidating queries`,
      );
      prevHeight.current = height;

      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          // Don't invalidate the height query itself
          return !(Array.isArray(key) && key[0] === 'height');
        },
      });
    }
  }, [height, queryClient]);

  return null;
}
