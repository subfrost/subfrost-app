/**
 * useAmmHistory — Infinite-scroll AMM transaction history
 *
 * Primary: SDK DataApi calls (dataApiGetAllAmmTxHistory / dataApiGetAllAddressAmmTxHistory)
 * Pool metadata enrichment uses dataApiGetAllPoolsDetails (single REST call),
 * with per-pool ammGetPoolDetails as fallback for any missing pools.
 *
 * JOURNAL ENTRY (2026-02-10):
 * Replaced raw fetch to /api/rpc/{slug}/get-all-amm-tx-history with SDK
 * DataApi methods. Removed networkToSlug helper since SDK handles routing.
 *
 * JOURNAL ENTRY (2026-02-12):
 * Replaced alkanesGetAllPoolsWithDetails (N+1 simulate calls) with
 * dataApiGetAllPoolsDetails (single REST call) for pool metadata enrichment.
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

/**
 * Normalize activity items from quspo (snake_case) to the camelCase shape
 * the ActivityFeed component expects. On mainnet the alkanode REST API
 * already returns camelCase, so this is a no-op for items that already have
 * the right field names.
 *
 * Also fixes timestamps: quspo may return block height or epoch seconds
 * instead of milliseconds.
 */
function normalizeActivityItem(item: any): any {
  if (!item || typeof item !== 'object') return item;

  // If already has camelCase fields, return as-is (mainnet alkanode)
  if (item.soldAmount !== undefined || item.transactionId !== undefined) {
    return item;
  }

  // snake_case → camelCase field mapping
  const mapped: any = { ...item };
  const renames: Record<string, string> = {
    sold_amount: 'soldAmount',
    bought_amount: 'boughtAmount',
    pool_block_id: 'poolBlockId',
    pool_tx_id: 'poolTxId',
    transaction_id: 'transactionId',
    sold_token_block_id: 'soldTokenBlockId',
    sold_token_tx_id: 'soldTokenTxId',
    bought_token_block_id: 'boughtTokenBlockId',
    bought_token_tx_id: 'boughtTokenTxId',
    seller_address: 'sellerAddress',
    minter_address: 'minterAddress',
    burner_address: 'burnerAddress',
    creator_address: 'creatorAddress',
    token0_amount: 'token0Amount',
    token1_amount: 'token1Amount',
    token_supply: 'tokenSupply',
    lp_token_amount: 'lpTokenAmount',
    token0_block_id: 'token0BlockId',
    token0_tx_id: 'token0TxId',
    token1_block_id: 'token1BlockId',
    token1_tx_id: 'token1TxId',
    tx_id: 'transactionId',
    txid: 'transactionId',
  };

  for (const [snake, camel] of Object.entries(renames)) {
    if (mapped[snake] !== undefined && mapped[camel] === undefined) {
      mapped[camel] = mapped[snake];
    }
  }

  // Normalize address: quspo may use various field names
  if (!mapped.address) {
    mapped.address = mapped.sellerAddress || mapped.minterAddress
      || mapped.burnerAddress || mapped.creatorAddress
      || mapped.sender || mapped.user || '';
  }

  // Normalize timestamp: quspo may return height (small number), epoch
  // seconds, or epoch milliseconds. The ActivityFeed expects something
  // parseable by new Date().
  if (mapped.timestamp !== undefined) {
    const ts = Number(mapped.timestamp);
    if (!isNaN(ts)) {
      if (ts < 1e8) {
        // Looks like a block height — convert to "now" since devnet has no
        // real wall-clock time. Use current time minus a small offset based
        // on how far back the height is from the latest.
        mapped.timestamp = Date.now();
      } else if (ts < 1e10) {
        // Epoch seconds → milliseconds
        mapped.timestamp = ts * 1000;
      }
      // else: already milliseconds, leave as-is
    }
  } else if (mapped.height !== undefined) {
    // No timestamp at all — use current time
    mapped.timestamp = Date.now();
  }

  // Ensure transactionId exists (for the Link key)
  if (!mapped.transactionId) {
    mapped.transactionId = mapped.tx_id || mapped.txid || mapped.hash || `unknown-${Math.random().toString(36).slice(2)}`;
  }

  return mapped;
}

// Hook to fetch pool metadata via dataApiGetAllPoolsDetails (single REST call)
function usePoolsMetadata(network: string, poolIds: string[]) {
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const { provider } = useAlkanesSDK();

  return useQuery({
    queryKey: ['poolsMetadata', network, poolIds.sort().join(',')],
    enabled: !!network && poolIds.length > 0 && !!provider,
    queryFn: async (): Promise<Record<string, PoolMetadata>> => {
      const poolMap: Record<string, PoolMetadata> = {};

      // Primary: dataApiGetAllPoolsDetails — single REST call
      try {
        const result = await Promise.race([
          provider!.dataApiGetAllPoolsDetails(ALKANE_FACTORY_ID),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000)),
        ]);
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        const pools = parsed?.pools || parsed?.data?.pools || [];

        for (const p of pools) {
          const poolId = p.poolId
            ? `${p.poolId.block}:${p.poolId.tx}`
            : `${p.pool_id_block}:${p.pool_id_tx}`;
          if (!poolIds.includes(poolId)) continue;

          // dataApi format uses poolId/token0/token1; RPC format uses details.*
          const d = p.details || {};
          poolMap[poolId] = {
            token0BlockId: String(p.token0?.alkaneId?.block ?? p.token0?.block ?? d.token_a_block ?? ''),
            token0TxId: String(p.token0?.alkaneId?.tx ?? p.token0?.tx ?? d.token_a_tx ?? ''),
            token1BlockId: String(p.token1?.alkaneId?.block ?? p.token1?.block ?? d.token_b_block ?? ''),
            token1TxId: String(p.token1?.alkaneId?.tx ?? p.token1?.tx ?? d.token_b_tx ?? ''),
            poolName: p.poolName ?? d.pool_name ?? '',
          };
        }
      } catch (e) {
        console.warn('[usePoolsMetadata] dataApiGetAllPoolsDetails failed:', e);
      }

      // Fallback: per-pool ammGetPoolDetails (single simulate each) for any missing
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
        const rawItemsRaw = Array.isArray(payload?.items) ? payload.items
          : Array.isArray(payload) ? payload
          : [];
        const total = payload?.total ?? rawItemsRaw.length;

        // Normalize snake_case → camelCase (quspo on devnet returns snake_case)
        const rawItems = rawItemsRaw.map(normalizeActivityItem);

        // Client-side category filter if the API doesn't support it
        const filteredItems = transactionType && transactionType !== 'wrap' && transactionType !== 'unwrap'
          ? rawItems.filter((item: any) => item?.type === transactionType)
          : rawItems;

        console.log(`[useAmmHistory] DataApi returned ${rawItems.length} items (total: ${total})`,
          rawItems[0] ? `first: ${JSON.stringify(rawItems[0]).slice(0, 200)}` : '');

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
