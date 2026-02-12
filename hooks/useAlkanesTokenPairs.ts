/**
 * useAlkanesTokenPairs - Find pools containing a specific token
 *
 * Priority order for pool data:
 * 1. dataApiGetAllTokenPairs — single REST call for all pairs (fastest)
 * 2. dataApiGetAllPoolsDetails — single REST call for all pools
 * No simulate fallback (N+1 RPC calls caused 15-60s delays per call).
 *
 * JOURNAL ENTRY (2026-02-11): Added dataApi methods as preferred sources.
 * JOURNAL ENTRY (2026-02-12): Fixed response parsing — backend returns
 * { data: { pools: [...] } } with camelCase nested fields (poolId.block, token0.block).
 */
import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { queryKeys } from '@/queries/keys';

export type AlkanesTokenPair = {
  token0: { id: string; token0Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  token1: { id: string; token1Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  poolId?: { block: number | string; tx: number | string };
} & Partial<AlkanesTokenPairsResult>;

// ============================================================================
// Helpers
// ============================================================================

function getTokenSymbol(tokenId: string, rawName?: string): string {
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.symbol;
  if (rawName) return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  return tokenId.split(':')[1] || 'UNK';
}

// ============================================================================
// SDK pool fetch — REST-only via dataApi
// ============================================================================

function normalizePoolArray(raw: any): any[] {
  if (!raw) return [];
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  // Backend returns { data: { pools: [...] } }; WASM may also return { pools: [...] } or raw array
  const pools = parsed?.pools || parsed?.data?.pools || (Array.isArray(parsed) ? parsed : []);
  return Array.isArray(pools) ? pools : [];
}

function toPoolRow(p: any): any {
  // Handle data API camelCase format (poolId: {block,tx}, token0: {block,tx})
  // and flat snake_case format (pool_block_id, token0_block_id)
  return {
    pool_block_id: Number(p.poolId?.block ?? p.pool_block_id ?? p.pool_id_block ?? 0),
    pool_tx_id: Number(p.poolId?.tx ?? p.pool_tx_id ?? p.pool_id_tx ?? 0),
    token0_block_id: Number(p.token0?.block ?? p.token0_block_id ?? p.details?.token_a_block ?? 0),
    token0_tx_id: Number(p.token0?.tx ?? p.token0_tx_id ?? p.details?.token_a_tx ?? 0),
    token1_block_id: Number(p.token1?.block ?? p.token1_block_id ?? p.details?.token_b_block ?? 0),
    token1_tx_id: Number(p.token1?.tx ?? p.token1_tx_id ?? p.details?.token_b_tx ?? 0),
    token0_amount: p.token0Amount ?? p.token0_amount ?? p.details?.reserve_a ?? '0',
    token1_amount: p.token1Amount ?? p.token1_amount ?? p.details?.reserve_b ?? '0',
    pool_name: p.poolName ?? p.pool_name ?? p.details?.pool_name ?? '',
  };
}

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
): Promise<AlkanesTokenPair[]> {
  const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)),
    ]);

  // Two REST-only tiers — no simulate fallback (avoids N+1 RPC calls that
  // flood the backend and cause 15-60s delays per call).
  // React Query's built-in retry handles transient failures.
  let poolsArray: any[] = [];

  // Method 1: dataApiGetAllTokenPairs — single REST call (preferred)
  try {
    const result = await withTimeout(provider.dataApiGetAllTokenPairs(factoryId), 30000, 'dataApiGetAllTokenPairs');
    const pools = normalizePoolArray(result);
    if (pools.length > 0) {
      poolsArray = pools.map(toPoolRow);
      console.log('[useAlkanesTokenPairs] dataApiGetAllTokenPairs returned', poolsArray.length, 'pools');
    }
  } catch (e) {
    console.warn('[useAlkanesTokenPairs] dataApiGetAllTokenPairs failed:', e);
  }

  // Method 2: dataApiGetAllPoolsDetails — single REST call
  if (poolsArray.length === 0) {
    try {
      const result = await withTimeout(provider.dataApiGetAllPoolsDetails(factoryId), 30000, 'dataApiGetAllPoolsDetails');
      const pools = normalizePoolArray(result);
      if (pools.length > 0) {
        poolsArray = pools.map(toPoolRow);
        console.log('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails returned', poolsArray.length, 'pools');
      }
    } catch (e) {
      console.warn('[useAlkanesTokenPairs] dataApiGetAllPoolsDetails failed:', e);
    }
  }

  if (poolsArray.length === 0) {
    throw new Error('Failed to fetch token pairs from data API');
  }

  const items: AlkanesTokenPair[] = [];
  for (const pool of poolsArray) {
    const token0Id = pool.token0_block_id && pool.token0_tx_id
      ? `${pool.token0_block_id}:${pool.token0_tx_id}` : '';
    const token1Id = pool.token1_block_id && pool.token1_tx_id
      ? `${pool.token1_block_id}:${pool.token1_tx_id}` : '';

    let token0Name = '';
    let token1Name = '';
    const poolName = pool.pool_name || '';
    if (poolName) {
      const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const poolIdBlock = pool.pool_block_id || 0;
    const poolIdTx = pool.pool_tx_id || 0;

    if (!token0Id || !token1Id) continue;

    items.push({
      token0: {
        id: token0Id,
        token0Amount: pool.token0_amount || '0',
        alkaneId: parseAlkaneId(token0Id || '0:0'),
        name: token0Name,
        symbol: token0Name,
      },
      token1: {
        id: token1Id,
        token1Amount: pool.token1_amount || '0',
        alkaneId: parseAlkaneId(token1Id || '0:0'),
        name: token1Name,
        symbol: token1Name,
      },
      poolId: { block: poolIdBlock, tx: poolIdTx },
      poolName,
    } as AlkanesTokenPair);
  }

  return items;
}

// ============================================================================
// Hook
// ============================================================================

export function useAlkanesTokenPairs(
  alkaneId: string,
  limit?: number,
  offset?: number,
  sortBy?: 'tvl' | undefined,
  searchQuery?: string,
) {
  const normalizedId = alkaneId === 'btc' ? '32:0' : alkaneId;
  const { provider } = useAlkanesSDK();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  const paramsKey = `${limit ?? ''}|${offset ?? ''}|${sortBy ?? ''}|${searchQuery ?? ''}`;

  return useQuery({
    enabled: !!normalizedId && !!network && !!ALKANE_FACTORY_ID && !!provider,
    queryKey: queryKeys.pools.tokenPairs(network, normalizedId, paramsKey),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    queryFn: async () => {
      if (!provider) {
        throw new Error('SDK provider not available');
      }

      const allPools = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID);
      console.log('[useAlkanesTokenPairs] SDK returned', allPools.length, 'pools');

      if (allPools.length === 0) {
        throw new Error('Failed to fetch pools from SDK');
      }

      // Filter to pools containing the requested token
      return allPools.filter(
        p => p.token0.id === normalizedId || p.token1.id === normalizedId,
      );
    },
  });
}
