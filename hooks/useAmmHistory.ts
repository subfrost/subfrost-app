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

// Network to API base URL mapping for REST API
const NETWORK_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/api',
  testnet: 'https://testnet.subfrost.io/v4/api',
  signet: 'https://signet.subfrost.io/v4/api',
  regtest: 'https://regtest.subfrost.io/v4/api',
  oylnet: 'https://regtest.subfrost.io/v4/api',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/api',
};

// Pool metadata cache type
type PoolMetadata = {
  token0BlockId: string;
  token0TxId: string;
  token1BlockId: string;
  token1TxId: string;
  poolName: string;
};

// Hook to fetch pool metadata for enriching mint/burn/creation transactions
function usePoolsMetadata(network: string) {
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const [factoryBlock, factoryTx] = (ALKANE_FACTORY_ID || '4:65522').split(':');

  return useQuery({
    queryKey: ['poolsMetadata', network],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!network,
    queryFn: async (): Promise<Record<string, PoolMetadata>> => {
      const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;

      try {
        const response = await fetch(`${apiUrl}/get-pools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factoryId: { block: factoryBlock, tx: factoryTx }
          }),
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const result = await response.json();
        const pools = result?.data?.pools || result?.pools || [];

        // Create a map of poolId -> token metadata
        const poolMap: Record<string, PoolMetadata> = {};
        for (const pool of pools) {
          const poolId = `${pool.pool_block_id}:${pool.pool_tx_id}`;
          poolMap[poolId] = {
            token0BlockId: pool.token0_block_id,
            token0TxId: pool.token0_tx_id,
            token1BlockId: pool.token1_block_id,
            token1TxId: pool.token1_tx_id,
            poolName: pool.pool_name || '',
          };
        }

        return poolMap;
      } catch (error) {
        console.error('[usePoolsMetadata] Failed to fetch pools:', error);
        return {};
      }
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
  const { data: poolsMetadata } = usePoolsMetadata(network);

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
      const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;

      try {
        // Use the REST API directly for reliable data
        const endpoint = address
          ? `${apiUrl}/get-all-address-amm-tx-history`
          : `${apiUrl}/get-all-amm-tx-history`;

        const body: Record<string, any> = {
          count,
          offset,
        };

        if (address) {
          body.address = address;
        }

        if (transactionType) {
          body.transactionType = transactionType;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const result = await response.json();

        // Handle different response formats:
        // { data: { transactions: [...] } } or { data: { items: [...] } } or { data: [...] } or [...]
        const rawData = result?.data?.transactions || result?.data?.items || result?.data || result?.transactions || result?.items || result || [];
        const items = Array.isArray(rawData) ? rawData : [];

        return {
          items,
          nextPage: items.length === count ? pageParam + 1 : undefined,
          total: result?.data?.total ?? result?.total ?? -1,
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
