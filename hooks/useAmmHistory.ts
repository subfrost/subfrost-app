'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { useApiProvider } from '@/hooks/useApiProvider';

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
  const api = useApiProvider();

  return useInfiniteQuery<
    AmmPageResponse<any>,
    Error,
    { pages: AmmPageResponse<any>[]; pageParams: number[] },
    (string | number | null)[],
    number
  >({
    queryKey: ['ammTxHistory', address ?? 'all', count, transactionType ?? 'all'],
    initialPageParam: 0,
    enabled,
    queryFn: async ({ pageParam }) => {
      const offset = pageParam * count;
      const params: any = { count, offset, includeTotal: false, transactionType };
      const data = address
        ? await api.getAllAddressAmmTxHistory({ address, ...params })
        : await api.getAllAmmTxHistory(params);

      const items = Array.isArray((data as any)?.items) ? (data as any).items : [];
      return {
        items,
        nextPage: items.length === count ? pageParam + 1 : undefined,
        total: (data as any)?.total ?? -1,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage as number | undefined,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}


