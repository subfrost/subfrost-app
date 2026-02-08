/**
 * useAmmHistory — Infinite-scroll AMM transaction history
 *
 * All data fetched through @alkanes/ts-sdk methods:
 * - Pool metadata: alkanesGetAllPoolsWithDetails (for enriching mint/burn/creation txs)
 * - Transaction history: dataApiGetPoolHistory (per-pool, aggregated client-side)
 *
 * JOURNAL (2026-02-07):
 * Previously used direct fetch to subfrost REST endpoints (/get-all-amm-tx-history).
 * Replaced with SDK methods to route all calls through the SDK's configured provider,
 * which uses /api/rpc proxy internally (avoids CORS issues).
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
  const { network, isInitialized, provider } = useAlkanesSDK();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  const query = useInfiniteQuery<
    AmmPageResponse<any>,
    Error,
    { pages: AmmPageResponse<any>[]; pageParams: number[] },
    (string | number | null)[],
    number
  >({
    queryKey: ['ammTxHistory', network, address ?? 'all', count, transactionType ?? 'all'],
    initialPageParam: 0,
    enabled: enabled && isInitialized && !!network && !!provider,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam * count;

      try {
        // SDK has per-pool history (dataApiGetPoolHistory) but no aggregate method.
        // Fetch all pool IDs, then get history for each pool and merge.
        const allPoolsResult = await Promise.race([
          provider!.alkanesGetAllPools(ALKANE_FACTORY_ID),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        ]);
        const parsed = typeof allPoolsResult === 'string' ? JSON.parse(allPoolsResult) : allPoolsResult;
        const poolIds: string[] = (parsed?.pools || parsed || []).map((p: any) =>
          p.pool_id || `${p.pool_id_block ?? p.block}:${p.pool_id_tx ?? p.tx}`
        );

        if (poolIds.length === 0) {
          return { items: [], nextPage: undefined, total: 0 };
        }

        // Fetch history from each pool in parallel (with per-call timeout)
        const category = transactionType === 'swap' ? 'swap'
          : transactionType === 'mint' ? 'mint'
          : transactionType === 'burn' ? 'burn'
          : null;

        const perPoolResults = await Promise.all(
          poolIds.map(async (poolId) => {
            try {
              const history = await Promise.race([
                provider!.dataApiGetPoolHistory(poolId, category, BigInt(count), BigInt(0)),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
              ]);
              const data = typeof history === 'string' ? JSON.parse(history) : history;
              const items = data?.data?.transactions || data?.transactions || data?.data || data || [];
              return Array.isArray(items) ? items : [];
            } catch {
              return [];
            }
          })
        );

        // Merge all pool histories, sort by timestamp/block descending
        let allItems = perPoolResults.flat();

        // Filter by address if specified
        if (address) {
          const addrLower = address.toLowerCase();
          allItems = allItems.filter((item: any) =>
            (item.address || item.sender || item.from || '').toLowerCase() === addrLower
          );
        }

        // Sort by timestamp descending (newest first)
        allItems.sort((a: any, b: any) => {
          const tsA = a.timestamp || a.blockHeight || 0;
          const tsB = b.timestamp || b.blockHeight || 0;
          return tsB - tsA;
        });

        // Apply pagination
        const paginated = allItems.slice(offset, offset + count);

        return {
          items: paginated,
          nextPage: paginated.length === count ? pageParam + 1 : undefined,
          total: allItems.length,
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
