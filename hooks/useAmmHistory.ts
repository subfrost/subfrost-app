/**
 * useAmmHistory — Infinite-scroll AMM transaction history
 *
 * Primary: Single fetch to /get-all-amm-tx-history (or /get-all-address-amm-tx-history)
 * via the RPC proxy. Returns all AMM transactions across all pools in one call.
 *
 * Pool metadata enrichment for mint/burn/creation txs uses alkanesGetAllPoolsWithDetails.
 */
'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';

type AmmPageResponse<T> = {
  items: T[];
  nextPage?: number;
  total?: number;
};

export type AmmTransactionType = 'swap' | 'mint' | 'burn' | 'creation' | 'wrap' | 'unwrap';

// Pool metadata cache type
type PoolMetadata = {
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  poolName: string;
};

/**
 * Map wallet network string to the RPC proxy slug.
 * Same pattern as queries/height.ts fetchHeight.
 */
function networkToSlug(network: string): string {
  if (network === 'mainnet') return 'mainnet';
  if (network === 'testnet') return 'testnet';
  if (network === 'signet') return 'signet';
  if (network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local') return 'regtest';
  return 'mainnet';
}

// Hook to fetch pool metadata via SDK's alkanesGetAllPoolsWithDetails
function usePoolsMetadata(network: string, poolIds: string[]) {
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const { provider } = useAlkanesSDK();

  return useQuery({
    queryKey: ['poolsMetadata', network, poolIds.sort().join(',')],
    enabled: !!network && poolIds.length > 0 && !!provider,
    queryFn: async (): Promise<Record<string, PoolMetadata>> => {
      const poolMap: Record<string, PoolMetadata> = {};

      try {
        const rpcResult = await Promise.race([
          provider!.alkanesGetAllPoolsWithDetails(ALKANE_FACTORY_ID),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
        ]);
        const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
        const pools = parsed?.pools || [];

        for (const p of pools) {
          const poolId = `${p.pool_id_block}:${p.pool_id_tx}`;
          if (!poolIds.includes(poolId)) continue;
          const d = p.details || {};
          poolMap[poolId] = {
            token0BlockId: String(d.token_a_block ?? ''),
            token0TxId: String(d.token_a_tx ?? ''),
            token1BlockId: String(d.token_b_block ?? ''),
            token1TxId: String(d.token_b_tx ?? ''),
            poolName: d.pool_name || '',
          };
        }
      } catch (e) {
        console.warn('[usePoolsMetadata] SDK fetch failed:', e);
      }

      // For any pools still missing, try individual ammGetPoolDetails
      const missing = poolIds.filter(id => !poolMap[id]);
      if (missing.length > 0 && provider) {
        await Promise.all(missing.map(async (poolId) => {
          try {
            const details = await Promise.race([
              provider!.ammGetPoolDetails(poolId),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]);
            const parsed = typeof details === 'string' ? JSON.parse(details) : details;
            if (parsed?.token_a_block != null) {
              poolMap[poolId] = {
                token0BlockId: String(parsed.token_a_block),
                token0TxId: String(parsed.token_a_tx),
                token1BlockId: String(parsed.token_b_block),
                token1TxId: String(parsed.token_b_tx),
                poolName: parsed.pool_name || '',
              };
            }
          } catch { /* skip */ }
        }));
      }

      return poolMap;
    },
  });
}

export function useInfiniteAmmTxHistory({
  address,
  count = 50,
  enabled = true,
  transactionType,
}: {
  address?: string | null;
  count?: number;
  enabled?: boolean;
  transactionType?: AmmTransactionType;
}) {
  const { network, isInitialized } = useAlkanesSDK();

  const query = useInfiniteQuery<
    AmmPageResponse<any>,
    Error,
    { pages: AmmPageResponse<any>[]; pageParams: number[] },
    (string | number | null)[],
    number
  >({
    queryKey: ['ammTxHistory', network, address ?? 'all', count, transactionType ?? 'all'],
    initialPageParam: 0,
    enabled: enabled && isInitialized && !!network,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam * count;
      const slug = networkToSlug(network);

      try {
        // Build request body for the data API
        const body: Record<string, any> = {
          count,
          offset,
        };

        // Use address-specific endpoint when filtering by address
        const endpoint = address
          ? `/api/rpc/${slug}/get-all-address-amm-tx-history`
          : `/api/rpc/${slug}/get-all-amm-tx-history`;

        if (address) {
          body.address = address;
        }

        // Map transactionType to API category filter if applicable
        if (transactionType && transactionType !== 'wrap' && transactionType !== 'unwrap') {
          body.category = transactionType;
        }

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`Data API returned ${res.status}`);
        }

        const json = await res.json();

        // The API response has { items, total, count, offset } (Page<AllAddressAmmTxRow>)
        const rawItems = Array.isArray(json?.items) ? json.items
          : Array.isArray(json) ? json
          : [];
        const total = json?.total ?? rawItems.length;

        console.log(`[useAmmHistory] ${endpoint} returned ${rawItems.length} items (total: ${total})`);

        return {
          items: rawItems,
          nextPage: rawItems.length === count ? pageParam + 1 : undefined,
          total,
        };
      } catch (error) {
        console.error('[useAmmHistory] Failed to fetch AMM history:', error);
        return { items: [], nextPage: undefined, total: 0 };
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage as number | undefined,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Extract unique pool IDs from mint/burn/creation transactions that need enrichment
  const poolIdsToFetch = useMemo(() => {
    if (!query.data) return [];
    const poolIds = new Set<string>();

    for (const page of query.data.pages) {
      const items = Array.isArray(page.items) ? page.items : [];
      for (const row of items) {
        if (!row) continue;
        // Only need to fetch metadata for mint/burn/creation that don't already have token IDs
        if ((row.type === 'mint' || row.type === 'burn' || row.type === 'creation')
            && row.poolBlockId && row.poolTxId
            && !row.token0BlockId) {
          poolIds.add(`${row.poolBlockId}:${row.poolTxId}`);
        }
      }
    }

    return Array.from(poolIds);
  }, [query.data]);

  // Fetch pool metadata for the pools we need
  const { data: poolsMetadata } = usePoolsMetadata(network, poolIdsToFetch);

  // Enrich mint/burn/creation transactions with token IDs from pool metadata
  const enrichedData = useMemo(() => {
    if (!query.data) return query.data;

    const pages = query.data.pages.map((page) => {
      const items = Array.isArray(page.items) ? page.items : [];
      const enrichedItems = items.map((row: any) => {
        if (!row) return row;

        // For mint/burn/creation, add token IDs from pool metadata
        if ((row.type === 'mint' || row.type === 'burn' || row.type === 'creation') && row.poolBlockId && row.poolTxId) {
          const poolId = `${row.poolBlockId}:${row.poolTxId}`;
          const poolMeta = poolsMetadata?.[poolId];

          if (poolMeta) {
            return {
              ...row,
              token0BlockId: poolMeta.token0BlockId,
              token0TxId: poolMeta.token0TxId,
              token1BlockId: poolMeta.token1BlockId,
              token1TxId: poolMeta.token1TxId,
            };
          }
        }

        return row;
      });
      return { ...page, items: enrichedItems };
    });

    return { ...query.data, pages };
  }, [query.data, poolsMetadata]);

  return { ...query, data: enrichedData };
}
