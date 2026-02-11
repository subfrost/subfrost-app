/**
 * useAmmHistory — Infinite-scroll AMM transaction history
 *
 * Primary: SDK DataApi calls (dataApiGetAllAmmTxHistory / dataApiGetAllAddressAmmTxHistory)
 * Pool metadata enrichment for mint/burn/creation txs uses /api/espo-pools.
 *
 * JOURNAL ENTRY (2026-02-10):
 * Replaced raw fetch to /api/rpc/{slug}/get-all-amm-tx-history with SDK
 * DataApi methods. Removed networkToSlug helper since SDK handles routing.
 * Replaced alkanesGetAllPoolsWithDetails with /api/espo-pools for metadata.
 */
'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

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

// Convert Map instances (from WASM serde) to plain objects
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

// Hook to fetch pool metadata via SDK's espoGetPools (single indexed call)
function usePoolsMetadata(network: string, poolIds: string[]) {
  const { provider } = useAlkanesSDK();

  return useQuery({
    queryKey: ['poolsMetadata', network, poolIds.sort().join(',')],
    enabled: !!network && poolIds.length > 0 && !!provider,
    queryFn: async (): Promise<Record<string, PoolMetadata>> => {
      const poolMap: Record<string, PoolMetadata> = {};

      try {
        const raw = await Promise.race([
          provider!.espoGetPools(500),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
        ]);
        const parsed = mapToObject(typeof raw === 'string' ? JSON.parse(raw) : raw);
        const poolsObj = parsed?.pools || {};

        // Handle both object-keyed and array formats
        const entries: [string, any][] = Array.isArray(poolsObj)
          ? poolsObj.map((p: any, i: number) => [p.pool_id || String(i), p])
          : Object.entries(poolsObj);

        for (const [poolId, p] of entries) {
          if (!poolIds.includes(poolId)) continue;

          const baseId = p.base || p.base_id || '0:0';
          const quoteId = p.quote || p.quote_id || '0:0';
          const [baseBlock, baseTx] = baseId.split(':');
          const [quoteBlock, quoteTx] = quoteId.split(':');

          poolMap[poolId] = {
            token0BlockId: baseBlock || '',
            token0TxId: baseTx || '',
            token1BlockId: quoteBlock || '',
            token1TxId: quoteTx || '',
            poolName: p.pool_name || p.name || '',
          };
        }
      } catch (e) {
        console.warn('[usePoolsMetadata] espoGetPools failed:', e);
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
      if (!provider) return { items: [], nextPage: undefined, total: 0 };
      const offset = pageParam * count;

      try {
        let raw: any;
        if (address) {
          raw = await provider.dataApiGetAllAddressAmmTxHistory(address, BigInt(count), BigInt(offset));
        } else {
          raw = await provider.dataApiGetAllAmmTxHistory(BigInt(count), BigInt(offset));
        }

        const result = mapToObject(raw);

        // API may return { data: { items, total, count, offset } } or { items, ... } directly
        const payload = result?.data ?? result;
        const rawItems = Array.isArray(payload?.items) ? payload.items
          : Array.isArray(payload) ? payload
          : [];
        const total = payload?.total ?? rawItems.length;

        // Client-side category filter if the API doesn't support it
        const filteredItems = transactionType && transactionType !== 'wrap' && transactionType !== 'unwrap'
          ? rawItems.filter((item: any) => item?.type === transactionType)
          : rawItems;

        console.log(`[useAmmHistory] DataApi returned ${rawItems.length} items (total: ${total})`);

        return {
          items: filteredItems,
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
