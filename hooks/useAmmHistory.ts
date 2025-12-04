'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

type AmmPageResponse<T> = {
  items: T[];
  nextPage?: number;
  total?: number;
};

export type AmmTransactionType = 'swap' | 'mint' | 'burn' | 'creation' | 'wrap' | 'unwrap';

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
  const { provider, isInitialized } = useAlkanesSDK();

  const query = useInfiniteQuery<
    AmmPageResponse<any>,
    Error,
    { pages: AmmPageResponse<any>[]; pageParams: number[] },
    (string | number | null)[],
    number
  >({
    queryKey: ['ammTxHistory', address ?? 'all', count, transactionType ?? 'all'],
    initialPageParam: 0,
    enabled: enabled && isInitialized && !!provider,
    queryFn: async ({ pageParam }) => {
      if (!provider) {
        return { items: [], nextPage: undefined, total: 0 };
      }

      const offset = pageParam * count;

      try {
        // Try to get AMM history via provider
        // Note: This method may need to be implemented in the WASM bindings
        let data: any;
        if (address) {
          // Try address-specific method if available
          if (typeof (provider as any).getAllAddressAmmTxHistory === 'function') {
            data = await (provider as any).getAllAddressAmmTxHistory({
              address,
              count,
              offset,
              includeTotal: false,
              transactionType,
            });
          } else {
            // Fallback: return empty result
            data = { items: [] };
          }
        } else {
          // Try global method if available
          if (typeof (provider as any).getAllAmmTxHistory === 'function') {
            data = await (provider as any).getAllAmmTxHistory({
              count,
              offset,
              includeTotal: false,
              transactionType,
            });
          } else {
            // Fallback: return empty result
            data = { items: [] };
          }
        }

        const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
        return {
          items,
          nextPage: items.length === count ? pageParam + 1 : undefined,
          total: (data as any)?.total ?? -1,
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

  // Allowlist of allowed pools by poolId (block:tx)
  const allowedPoolIds = useMemo(
    () =>
      new Set<string>([
        '2:77222',
        '2:77087',
        '2:77221',
        '2:77237',
        '2:77228',
        '2:68441',
        '2:68433',
      ]),
    [],
  );

  // Filter pages to only include allowed pairs; exclude wrap/unwrap always
  const filteredData = useMemo(() => {
    if (!query.data) return query.data;
    const pages = query.data.pages.map((page) => {
      const items = Array.isArray(page.items) ? page.items : [];
      const filteredItems = items.filter((row: any) => {
        if (!row || !row.type) return false;
        // Do not apply pair filter to wrap/unwrap
        if (row.type === 'wrap' || row.type === 'unwrap') return true;

        // For AMM pool-related rows, match by poolId = block:tx
        const poolId = row?.poolBlockId && row?.poolTxId ? `${row.poolBlockId}:${row.poolTxId}` : null;
        if (!poolId) return false;
        return allowedPoolIds.has(poolId);
      });
      return { ...page, items: filteredItems };
    });
    return { ...query.data, pages };
  }, [query.data, allowedPoolIds]);

  return { ...query, data: filteredData };
}
