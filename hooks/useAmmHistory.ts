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
 * Normalize activity items into the shape ActivityFeed expects.
 *
 * Two formats arrive here:
 *
 * 1. **Mainnet alkanode REST** — fully enriched camelCase items with type,
 *    amounts, token IDs, addresses. These pass through with minimal changes.
 *
 * 2. **Devnet quspo traces** — raw execution traces with only:
 *    { height, kind, opcode, success, target, txid, vout }
 *    We derive `type` from target+opcode and fill in what we can.
 */
function normalizeActivityItem(item: any): any {
  if (!item || typeof item !== 'object') return item;

  // ── Already-enriched items (mainnet alkanode) ────────────────────────
  // If the item already has a recognized `type` field, it's from the
  // alkanode REST API. Just do light normalization.
  if (item.type === 'swap' || item.type === 'mint' || item.type === 'burn'
      || item.type === 'creation' || item.type === 'wrap' || item.type === 'unwrap') {
    const mapped = { ...item };
    // snake_case rename pass for any mixed-format edge cases
    const renames: Record<string, string> = {
      sold_amount: 'soldAmount', bought_amount: 'boughtAmount',
      transaction_id: 'transactionId', tx_id: 'transactionId', txid: 'transactionId',
      sold_token_block_id: 'soldTokenBlockId', sold_token_tx_id: 'soldTokenTxId',
      bought_token_block_id: 'boughtTokenBlockId', bought_token_tx_id: 'boughtTokenTxId',
      pool_block_id: 'poolBlockId', pool_tx_id: 'poolTxId',
      token0_amount: 'token0Amount', token1_amount: 'token1Amount',
      token0_block_id: 'token0BlockId', token0_tx_id: 'token0TxId',
      token1_block_id: 'token1BlockId', token1_tx_id: 'token1TxId',
      seller_address: 'sellerAddress', minter_address: 'minterAddress',
      burner_address: 'burnerAddress', creator_address: 'creatorAddress',
    };
    for (const [snake, camel] of Object.entries(renames)) {
      if (mapped[snake] !== undefined && mapped[camel] === undefined) {
        mapped[camel] = mapped[snake];
      }
    }
    if (!mapped.transactionId) mapped.transactionId = mapped.txid || mapped.tx_id || '';
    return mapped;
  }

  // ── Raw quspo execution traces ───────────────────────────────────────
  // Shape: { height, kind, opcode, success, target, txid, vout }
  // We derive the activity type from target (contract ID) + opcode.
  if (item.target !== undefined && item.opcode !== undefined) {
    return normalizeQuspoTrace(item);
  }

  // ── Unknown format — pass through with basic fixes ───────────────────
  const mapped = { ...item };
  if (!mapped.transactionId) {
    mapped.transactionId = mapped.txid || mapped.tx_id || mapped.transaction_id
      || mapped.hash || `unknown-${Math.random().toString(36).slice(2)}`;
  }
  if (!mapped.timestamp) mapped.timestamp = Date.now();
  return mapped;
}

/**
 * Transform a raw quspo execution trace into an ActivityFeed-compatible item.
 *
 * Known contract targets and opcodes (from CLAUDE.md):
 * - Factory [4:65522] opcode 1 → creation (CreateNewPool)
 * - Factory [4:65522] opcode 13 → swap (SwapExactTokensForTokens)
 * - Pool [2:N] opcode 1 → mint (AddLiquidity)
 * - Pool [2:N] opcode 2 → burn (WithdrawAndBurn)
 * - Pool [2:N] opcode 3 → swap (direct pool swap)
 * - frBTC [32:0] opcode 77 → wrap
 * - frBTC [32:0] opcode 78 → unwrap
 * - DIESEL [2:0] opcode 77 → mint (faucet, not shown)
 * - Deploy [kind=19, opcode=0] → contract deployment
 */
function normalizeQuspoTrace(trace: any): any {
  const target = String(trace.target || '');
  const opcode = Number(trace.opcode ?? -1);
  const [targetBlock, targetTx] = target.split(':').map(Number);

  let type: string = 'unknown';

  // frBTC contract [32:0]
  if (targetBlock === 32 && targetTx === 0) {
    type = opcode === 77 ? 'wrap' : opcode === 78 ? 'unwrap' : 'unknown';
  }
  // Factory contract [4:65522] (devnet default factory proxy)
  else if (targetBlock === 4 && (targetTx === 65522 || targetTx === 65498)) {
    if (opcode === 1) type = 'creation';
    else if (opcode === 13 || opcode === 14 || opcode === 29) type = 'swap';
    else if (opcode === 11) type = 'mint'; // AddLiquidity via factory router
    else if (opcode === 12) type = 'burn'; // Burn via factory router
    else if (opcode === 0) type = 'creation'; // Factory init (deploy)
  }
  // Pool instances [2:N where N > 0]
  else if (targetBlock === 2 && targetTx > 0) {
    if (opcode === 1) type = 'mint';
    else if (opcode === 2) type = 'burn';
    else if (opcode === 3) type = 'swap';
  }
  // DIESEL [2:0] opcode 77 = faucet mint — skip or show as "mint"
  else if (targetBlock === 2 && targetTx === 0 && opcode === 77) {
    type = 'wrap'; // Show DIESEL mints as wraps for visibility
  }
  // Vault, FIRE, Gauge, Fujin — show as generic contract calls
  else if (targetBlock === 4) {
    // Contract deployments (kind=19, opcode=0) — skip
    if (opcode === 0 && trace.kind === 19) {
      return null; // Will be filtered out
    }
    type = 'creation'; // Generic contract interaction
  }

  // Filter out unrecognized traces
  if (type === 'unknown') return null;

  // Build the normalized item
  const result: any = {
    type,
    transactionId: trace.txid || '',
    timestamp: Date.now(), // Devnet has no wall-clock time; use current time
    address: '', // Not available in trace data
  };

  if (type === 'swap') {
    // We know the factory handles DIESEL↔frBTC swaps on devnet
    result.soldTokenBlockId = '2';
    result.soldTokenTxId = '0';
    result.boughtTokenBlockId = '32';
    result.boughtTokenTxId = '0';
    result.soldAmount = '0'; // Not available from trace
    result.boughtAmount = '0';
    result.poolBlockId = String(targetBlock);
    result.poolTxId = String(targetTx);
  } else if (type === 'mint' || type === 'burn' || type === 'creation') {
    result.token0BlockId = '2';
    result.token0TxId = '0';
    result.token1BlockId = '32';
    result.token1TxId = '0';
    result.token0Amount = '0';
    result.token1Amount = '0';
    result.lpTokenAmount = '0';
    result.poolBlockId = String(targetBlock);
    result.poolTxId = String(targetTx);
  } else if (type === 'wrap' || type === 'unwrap') {
    result.amount = '0'; // Not available from trace
  }

  return result;
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
      // On devnet, the SDK's dataApi path hangs the main thread before the timeout
      // race can fire, freezing the loading screen at 95-99%. Use a direct quspo
      // call instead — fast, non-blocking, and returns real activity data.
      if (network === 'devnet') {
        try {
          const { quspoView } = await import('@/lib/devnet/quspoQuery');
          const activity = await quspoView<{ items: any[]; count: number }>(
            'get_activity', { limit: count }, 'devnet',
          );
          const items = (activity?.items || []).map((item: any, idx: number) => ({
            id: `${item.txid || idx}-${idx}`,
            txid: item.txid || '',
            blockHeight: item.height || 0,
            soldAmount: '0', boughtAmount: '0',
            soldTokenBlockId: '', soldTokenTxId: '',
            boughtTokenBlockId: '', boughtTokenTxId: '',
            timestamp: 0,
          }));
          return { items, nextPage: undefined, total: activity?.count || 0 };
        } catch {
          return { items: [], nextPage: undefined, total: 0 };
        }
      }
      const offset = pageParam * count;

      try {
        let raw: any;

        // On devnet, the data API calls route to quspo (deprecated) which can hang
        // for 2+ minutes, freezing the entire UI. Wrap in a 3-second timeout.
        // If the call times out, return empty — the user can still see trades after
        // manually executing a swap (which triggers a refetch with fresh data).
        const dataApiCall = address
          ? provider.dataApiGetAllAddressAmmTxHistory(address, BigInt(count), BigInt(offset))
          : provider.dataApiGetAllAmmTxHistory(BigInt(count), BigInt(offset));

        raw = await Promise.race([
          dataApiCall,
          new Promise((_, reject) => setTimeout(() => reject(new Error('dataApi timeout (3s)')), 3000)),
        ]);

        const result = mapToObject(raw);

        // API may return { data: { items, total, count, offset } } or { items, ... } directly
        // Also handle { statusCode, data: [...items] } from devnet server
        const payload = result?.data ?? result;
        const rawItemsRaw = Array.isArray(payload?.items) ? payload.items
          : Array.isArray(payload) ? payload
          : [];

        // Normalize items (handles both mainnet enriched format and devnet raw traces)
        // Filter out nulls (traces we want to skip, e.g. contract deployments)
        const rawItems = rawItemsRaw
          .map(normalizeActivityItem)
          .filter((item: any) => item != null);
        const total = payload?.total ?? rawItems.length;

        // Client-side category filter if the API doesn't support it
        const filteredItems = transactionType && transactionType !== 'wrap' && transactionType !== 'unwrap'
          ? rawItems.filter((item: any) => item?.type === transactionType)
          : rawItems;

        console.log(`[useAmmHistory] ${rawItems.length} items (${rawItemsRaw.length} raw, type filter: ${transactionType || 'all'})`);

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
