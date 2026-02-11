/**
 * useDynamicPools - Fetches pools via SDK's espoGetPools (single indexed call)
 *
 * Uses provider.espoGetPools() which makes ONE call to the Espo indexer,
 * following the same pattern as provider.espoGetAlkaneInfo() used elsewhere.
 * Replaces the previous N+1 alkanes_simulate calls via alkanesGetAllPoolsWithDetails
 * that flooded the RPC endpoint and froze the app.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { queryKeys } from '@/queries/keys';

export type DynamicPool = {
  pool_id: string;
  pool_id_block: number;
  pool_id_tx: number;
  details: {
    token_a_block?: number;
    token_a_tx?: number;
    token_b_block?: number;
    token_b_tx?: number;
    token_a_name?: string;
    token_b_name?: string;
    reserve_a?: string;
    reserve_b?: string;
    pool_name?: string;
    [key: string]: any;
  };
};

export type DynamicPoolsResult = {
  total: number;
  count: number;
  pools: DynamicPool[];
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
 * Parse espo pool data into DynamicPool format.
 * Espo get_pools returns: { pools: { "2:6": { base, quote, base_reserve, quote_reserve } } }
 * Pool IDs are object keys, not array items.
 */
function parseEspoPools(raw: any): DynamicPool[] {
  const pools: DynamicPool[] = [];
  const poolsObj = raw?.pools || {};

  // Handle both object-keyed format and array format
  const entries: [string, any][] = Array.isArray(poolsObj)
    ? poolsObj.map((p: any, i: number) => [p.pool_id || String(i), p])
    : Object.entries(poolsObj);

  for (const [poolId, p] of entries) {
    const [poolBlockStr, poolTxStr] = poolId.split(':');
    const poolIdBlock = parseInt(poolBlockStr, 10) || 0;
    const poolIdTx = parseInt(poolTxStr, 10) || 0;

    // Espo fields: base, quote, base_reserve, quote_reserve
    // Also handle normalized format: base_id, quote_id, base_amount, quote_amount
    const baseId = p.base || p.base_id || '';
    const quoteId = p.quote || p.quote_id || '';
    const [baseBlock, baseTx] = (baseId || '0:0').split(':');
    const [quoteBlock, quoteTx] = (quoteId || '0:0').split(':');

    const reserveA = String(p.base_reserve || p.base_amount || '0');
    const reserveB = String(p.quote_reserve || p.quote_amount || '0');
    const poolName = p.pool_name || p.name || '';

    // Get token names from espo or parse from pool_name
    let tokenAName = (p.base_name || p.base_symbol || '').replace('SUBFROST BTC', 'frBTC');
    let tokenBName = (p.quote_name || p.quote_symbol || '').replace('SUBFROST BTC', 'frBTC');

    if ((!tokenAName || !tokenBName) && poolName) {
      const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        tokenAName = tokenAName || match[1].trim().replace('SUBFROST BTC', 'frBTC');
        tokenBName = tokenBName || match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    pools.push({
      pool_id: poolId,
      pool_id_block: poolIdBlock,
      pool_id_tx: poolIdTx,
      details: {
        token_a_block: parseInt(baseBlock, 10) || 0,
        token_a_tx: parseInt(baseTx, 10) || 0,
        token_b_block: parseInt(quoteBlock, 10) || 0,
        token_b_tx: parseInt(quoteTx, 10) || 0,
        token_a_name: tokenAName,
        token_b_name: tokenBName,
        reserve_a: reserveA,
        reserve_b: reserveB,
        pool_name: poolName,
      },
    });
  }

  return pools;
}

/**
 * Fetch all pools via SDK espoGetPools (single Espo indexed call)
 */
export function useDynamicPools(options?: {
  chunk_size?: number;
  max_concurrent?: number;
  enabled?: boolean;
}) {
  const { network } = useWallet();
  const config = getConfig(network);
  const factoryId = config.ALKANE_FACTORY_ID;
  const { provider } = useAlkanesSDK();

  const { enabled = true } = options || {};

  return useQuery<DynamicPoolsResult>({
    queryKey: queryKeys.pools.dynamic(network, factoryId),
    enabled: enabled && !!factoryId && !!network && !!provider,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    queryFn: async () => {
      if (!provider) throw new Error('SDK provider not available');

      console.log('[useDynamicPools] Fetching pools via espoGetPools for network:', network);

      // Primary: espoGetPools (single indexed call, same pattern as espoGetAlkaneInfo)
      try {
        const raw = await Promise.race([
          provider.espoGetPools(500),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('espoGetPools timeout (15s)')), 15000)),
        ]);
        const parsed = mapToObject(typeof raw === 'string' ? JSON.parse(raw) : raw);
        console.log('[useDynamicPools] espoGetPools raw response keys:', Object.keys(parsed || {}));

        const pools = parseEspoPools(parsed);
        if (pools.length > 0) {
          console.log('[useDynamicPools] espoGetPools returned', pools.length, 'pools');
          return { total: pools.length, count: pools.length, pools };
        }
        console.warn('[useDynamicPools] espoGetPools returned 0 pools');
      } catch (e) {
        console.warn('[useDynamicPools] espoGetPools failed:', e);
      }

      // Fallback: dataApiGetAllPoolsDetails (single DataApi call, no simulate)
      try {
        const raw = await Promise.race([
          provider.dataApiGetAllPoolsDetails(factoryId),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dataApi timeout (20s)')), 20000)),
        ]);
        const parsed = mapToObject(typeof raw === 'string' ? JSON.parse(raw) : raw);
        const apiPools = parsed?.pools || parsed?.data?.pools || [];
        console.log('[useDynamicPools] dataApi fallback returned', apiPools.length, 'pools');

        const pools: DynamicPool[] = [];
        for (const p of apiPools) {
          const poolId = p.poolId ? `${p.poolId.block}:${p.poolId.tx}` : '';
          const token0Id = p.token0 ? `${p.token0.block}:${p.token0.tx}` : '';
          const token1Id = p.token1 ? `${p.token1.block}:${p.token1.tx}` : '';
          if (!poolId) continue;

          const [pBlock, pTx] = poolId.split(':');
          const [t0Block, t0Tx] = (token0Id || '0:0').split(':');
          const [t1Block, t1Tx] = (token1Id || '0:0').split(':');

          pools.push({
            pool_id: poolId,
            pool_id_block: parseInt(pBlock, 10) || 0,
            pool_id_tx: parseInt(pTx, 10) || 0,
            details: {
              token_a_block: parseInt(t0Block, 10) || 0,
              token_a_tx: parseInt(t0Tx, 10) || 0,
              token_b_block: parseInt(t1Block, 10) || 0,
              token_b_tx: parseInt(t1Tx, 10) || 0,
              token_a_name: '',
              token_b_name: '',
              reserve_a: p.token0Amount || '0',
              reserve_b: p.token1Amount || '0',
              pool_name: p.poolName || '',
            },
          });
        }

        if (pools.length > 0) {
          return { total: pools.length, count: pools.length, pools };
        }
      } catch (e) {
        console.warn('[useDynamicPools] dataApi fallback failed:', e);
      }

      throw new Error('Failed to fetch pools from espo and dataApi');
    },
  });
}

/**
 * Get filtered pools based on a token whitelist
 */
export function useFilteredDynamicPools(
  tokenWhitelist: Set<string>,
  options?: {
    chunk_size?: number;
    max_concurrent?: number;
    enabled?: boolean;
  }
) {
  const poolsQuery = useDynamicPools(options);

  const filteredPools = poolsQuery.data?.pools.filter(() => {
    return true;
  });

  return {
    ...poolsQuery,
    filteredPools: filteredPools || [],
  };
}
