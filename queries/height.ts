'use client';

/**
 * Height-based polling — the SINGLE source of query invalidation.
 *
 * HeightPoller is a headless component that:
 *   1. Polls `get_espo_height` (mainnet) or `metashrew_height` (regtest) every 10 s.
 *   2. When the height changes, invalidates ALL other queries.
 *
 * Every other query uses `staleTime: Infinity` and never self-refreshes.
 */

import { useEffect, useRef } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from './keys';

// ---------------------------------------------------------------------------
// Query options factory
// ---------------------------------------------------------------------------

async function fetchHeight(network: string): Promise<number> {
  const isRegtest =
    network === 'regtest' ||
    network === 'subfrost-regtest' ||
    network === 'regtest-local';

  if (isRegtest) {
    // Use metashrew_height via the RPC proxy
    const res = await fetch('/api/rpc', {
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
    return typeof json.result === 'number' ? json.result : 0;
  }

  // Mainnet / testnet / signet — use Espo get_espo_height
  const res = await fetch('https://api.alkanode.com/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'get_espo_height',
      params: {},
      id: 1,
    }),
  });
  const json = await res.json();
  return typeof json.result === 'number'
    ? json.result
    : json.result?.height ?? 0;
}

export function espoHeightQueryOptions(network: string) {
  return queryOptions({
    queryKey: queryKeys.height.espo(network),
    queryFn: () => fetchHeight(network),
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

  const { data: height } = useQuery(espoHeightQueryOptions(network));

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
