/**
 * useAlkanesTokenPairs - Find pools containing a specific token
 *
 * Primary: OYL Alkanode /get-all-pools-details (REST, no WASM/CORS issues)
 * Fallback: ts-sdk dataApiGetPools / alkanesGetAllPoolsWithDetails
 */
import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';

export type AlkanesTokenPair = {
  token0: { id: string; token0Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  token1: { id: string; token1Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  poolId?: { block: number | string; tx: number | string };
} & Partial<AlkanesTokenPairsResult>;

// ============================================================================
// OYL Alkanode fetch
// ============================================================================

interface AlkaneId {
  block: string;
  tx: string;
}

interface OylPoolDetails {
  poolId?: AlkaneId;
  poolName: string;
  token0: AlkaneId;
  token1: AlkaneId;
  token0Amount: string;
  token1Amount: string;
  tokenSupply: string;
  poolTvlInUsd?: number | string;
  poolVolume1dInUsd?: number | string;
}

function getTokenSymbol(tokenId: string, rawName?: string): string {
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.symbol;
  if (rawName) return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  return tokenId.split(':')[1] || 'UNK';
}

async function fetchPoolsFromAlkanode(
  alkanodeUrl: string,
  factoryId: string,
): Promise<AlkanesTokenPair[]> {
  const [block, tx] = factoryId.split(':');

  const response = await fetch(`${alkanodeUrl}/get-all-pools-details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factoryId: { block, tx } }),
  });

  if (!response.ok) {
    throw new Error(`OYL Alkanode error: ${response.status}`);
  }

  const json = await response.json();
  const pools: OylPoolDetails[] = json?.data?.pools ?? [];
  const items: AlkanesTokenPair[] = [];

  for (const p of pools) {
    const poolIdBlock = p.poolId?.block ?? p.token0.block;
    const poolIdTx = p.poolId?.tx ?? p.token0.tx;
    const token0Id = `${p.token0.block}:${p.token0.tx}`;
    const token1Id = `${p.token1.block}:${p.token1.tx}`;

    const nameParts = p.poolName.split('/').map(s => s.trim());
    const token0Symbol = nameParts[0] || getTokenSymbol(token0Id);
    const token1Symbol = nameParts[1] || getTokenSymbol(token1Id);

    if (!token0Id || !token1Id) continue;

    items.push({
      token0: {
        id: token0Id,
        token0Amount: p.token0Amount,
        alkaneId: parseAlkaneId(token0Id),
        name: token0Symbol,
        symbol: token0Symbol,
      },
      token1: {
        id: token1Id,
        token1Amount: p.token1Amount,
        alkaneId: parseAlkaneId(token1Id),
        name: token1Symbol,
        symbol: token1Symbol,
      },
      poolId: { block: poolIdBlock, tx: poolIdTx },
      poolName: p.poolName,
    } as AlkanesTokenPair);
  }

  return items;
}

// ============================================================================
// SDK fallback helpers
// ============================================================================

function extractPoolsArray(response: any): any[] {
  if (!response) return [];
  if (response instanceof Map) {
    const data = response.get('data');
    if (data instanceof Map) {
      const pools = data.get('pools');
      if (Array.isArray(pools)) return pools;
    }
    const directPools = response.get('pools');
    if (Array.isArray(directPools)) return directPools;
    return [];
  }
  if (response.data?.pools && Array.isArray(response.data.pools)) return response.data.pools;
  if (response.pools && Array.isArray(response.pools)) return response.pools;
  if (Array.isArray(response)) return response;
  return [];
}

function poolToObject(pool: any): any {
  if (pool instanceof Map) {
    const obj: any = {};
    pool.forEach((value: any, key: string) => { obj[key] = value; });
    return obj;
  }
  return pool;
}

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
): Promise<AlkanesTokenPair[]> {
  let poolsArray: any[] = [];

  try {
    const poolsResponse = await provider.dataApiGetPools(factoryId);
    poolsArray = extractPoolsArray(poolsResponse);
  } catch (e) {
    console.warn('[useAlkanesTokenPairs] SDK dataApiGetPools failed:', e);
  }

  if (poolsArray.length === 0) {
    try {
      const rpcResult = await provider.alkanesGetAllPoolsWithDetails(factoryId);
      const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      const rpcPools = parsed?.pools || [];
      poolsArray = rpcPools.map((p: any) => ({
        pool_block_id: p.pool_id_block,
        pool_tx_id: p.pool_id_tx,
        token0_block_id: p.details?.token_a_block,
        token0_tx_id: p.details?.token_a_tx,
        token1_block_id: p.details?.token_b_block,
        token1_tx_id: p.details?.token_b_tx,
        token0_amount: p.details?.reserve_a || '0',
        token1_amount: p.details?.reserve_b || '0',
        pool_name: p.details?.pool_name || '',
      }));
    } catch (e) {
      console.warn('[useAlkanesTokenPairs] SDK RPC failed:', e);
    }
  }

  if (poolsArray.length === 0) return [];

  const items: AlkanesTokenPair[] = [];
  for (const p of poolsArray) {
    const pool = poolToObject(p);
    const token0Id = pool.token0_id ||
      (pool.token0_block_id && pool.token0_tx_id ? `${pool.token0_block_id}:${pool.token0_tx_id}` : '');
    const token1Id = pool.token1_id ||
      (pool.token1_block_id && pool.token1_tx_id ? `${pool.token1_block_id}:${pool.token1_tx_id}` : '');

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

    const poolIdBlock = pool.pool_block_id || pool.pool_id?.split(':')[0] || 0;
    const poolIdTx = pool.pool_tx_id || pool.pool_id?.split(':')[1] || 0;

    if (!token0Id || !token1Id) continue;

    items.push({
      token0: {
        id: token0Id,
        token0Amount: pool.token0_amount || pool.reserve0 || '0',
        alkaneId: parseAlkaneId(token0Id || '0:0'),
        name: token0Name,
        symbol: token0Name,
      },
      token1: {
        id: token1Id,
        token1Amount: pool.token1_amount || pool.reserve1 || '0',
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
  const { ALKANE_FACTORY_ID, OYL_ALKANODE_URL } = getConfig(network);

  return useQuery({
    enabled: !!normalizedId && !!network && !!ALKANE_FACTORY_ID,
    queryKey: ['alkanesTokenPairs', normalizedId, limit, offset, sortBy, searchQuery, network],
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    queryFn: async () => {
      let allPools: AlkanesTokenPair[] = [];

      // Primary: OYL Alkanode (REST, no WASM/CORS issues)
      try {
        allPools = await fetchPoolsFromAlkanode(OYL_ALKANODE_URL, ALKANE_FACTORY_ID);
        console.log('[useAlkanesTokenPairs] OYL Alkanode returned', allPools.length, 'pools');
      } catch (e) {
        console.warn('[useAlkanesTokenPairs] OYL Alkanode failed:', e);
      }

      // Fallback: ts-sdk
      if (allPools.length === 0 && provider) {
        allPools = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID);
        console.log('[useAlkanesTokenPairs] SDK returned', allPools.length, 'pools');
      }

      if (allPools.length === 0) {
        throw new Error('Failed to fetch pools from any source');
      }

      // Filter to pools containing the requested token
      return allPools.filter(
        p => p.token0.id === normalizedId || p.token1.id === normalizedId,
      );
    },
  });
}
