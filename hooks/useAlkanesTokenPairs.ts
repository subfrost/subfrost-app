import { useQuery } from '@tanstack/react-query';
import type { AlkanesTokenPairsResult } from '@/lib/api-provider/apiclient/types';

import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';

// Subfrost API key for higher rate limits (used in URL path)
const SUBFROST_API_KEY = 'd5ccdb288adb17eeab785a15766cc897';

// Network to API base URL mapping for REST API fallback (Data API)
const NETWORK_API_URLS: Record<string, string> = {
  mainnet: `https://mainnet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  testnet: `https://testnet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  signet: `https://signet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  regtest: `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
  oylnet: `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
  'regtest-local': 'http://localhost:4000',
  'subfrost-regtest': `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
};

export type AlkanesTokenPair = {
  token0: { id: string; token0Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  token1: { id: string; token1Amount?: string; alkaneId?: { block: number | string; tx: number | string } };
  poolId?: { block: number | string; tx: number | string };
} & Partial<AlkanesTokenPairsResult>;

/**
 * Helper to extract pools array from WASM provider response
 * The WASM binding may return Map, object, or array depending on serialization
 */
function extractPoolsArray(response: any): any[] {
  if (!response) return [];

  // Handle Map response - serde_wasm_bindgen serializes objects as Maps
  if (response instanceof Map) {
    // Check for nested data.pools structure
    const data = response.get('data');
    if (data instanceof Map) {
      const pools = data.get('pools');
      if (Array.isArray(pools)) {
        return pools;
      }
    }

    // Check for direct pools key
    const directPools = response.get('pools');
    if (Array.isArray(directPools)) {
      return directPools;
    }

    return [];
  }

  // Handle plain object
  if (response.data?.pools && Array.isArray(response.data.pools)) {
    return response.data.pools;
  }
  if (response.pools && Array.isArray(response.pools)) {
    return response.pools;
  }
  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

/**
 * Convert pool object to plain object
 */
function poolToObject(pool: any): any {
  if (pool instanceof Map) {
    const obj: any = {};
    pool.forEach((value: any, key: string) => {
      obj[key] = value;
    });
    return obj;
  }
  return pool;
}

export function useAlkanesTokenPairs(
  alkaneId: string,
  limit?: number,
  offset?: number,
  sortBy?: 'tvl' | undefined,
  searchQuery?: string,
) {
  const normalizedId = alkaneId === 'btc' ? '32:0' : alkaneId;
  const { provider, isInitialized } = useAlkanesSDK();
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);

  return useQuery({
    enabled: !!normalizedId && isInitialized && !!provider,
    queryKey: ['alkanesTokenPairs', normalizedId, limit, offset, sortBy, searchQuery, network],
    staleTime: 30_000, // 30 seconds - poll more frequently for realtime quotes
    refetchInterval: 30_000, // Auto-refresh every 30s for up-to-date reserves
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not initialized');
      }

      const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
      const [factoryBlock, factoryTx] = ALKANE_FACTORY_ID.split(':');
      let poolsArray: any[] = [];

      // =====================================================================
      // FALLBACK CHAIN: Try multiple methods to get pools
      // This mirrors the fallback logic in usePools.ts
      // =====================================================================

      // Method 1: Try WASM provider's dataApiGetPools
      try {
        const poolsResponse = await provider.dataApiGetPools(ALKANE_FACTORY_ID);
        poolsArray = extractPoolsArray(poolsResponse);
        console.log('[useAlkanesTokenPairs] WASM provider returned', poolsArray.length, 'pools');
      } catch (e) {
        console.warn('[useAlkanesTokenPairs] WASM provider failed:', e);
      }

      // Method 2: If empty, try REST API /get-pools
      if (poolsArray.length === 0) {
        try {
          console.log('[useAlkanesTokenPairs] Trying REST API fallback...');
          const response = await fetch(`${apiUrl}/get-pools`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              factoryId: { block: factoryBlock, tx: factoryTx }
            }),
          });

          if (response.ok) {
            const result = await response.json();
            // Check for error in response body (some APIs return 200 with error)
            if (!result?.error && result?.statusCode !== 404) {
              const rawData = result?.data?.pools || result?.data || result?.pools || result || [];
              poolsArray = Array.isArray(rawData) ? rawData : [];
              console.log('[useAlkanesTokenPairs] REST API returned', poolsArray.length, 'pools');
              // If REST API returned empty, log that we'll try next fallback
              if (poolsArray.length === 0) {
                console.log('[useAlkanesTokenPairs] REST API returned empty, will try next fallback');
              }
            }
          }
        } catch (e) {
          console.warn('[useAlkanesTokenPairs] REST API failed:', e);
        }
      }

      // Method 3: If still empty, try RPC alkanesGetAllPoolsWithDetails
      if (poolsArray.length === 0) {
        try {
          console.log('[useAlkanesTokenPairs] Trying RPC fallback...');
          const rpcResult = await provider.alkanesGetAllPoolsWithDetails(ALKANE_FACTORY_ID);
          const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
          const rpcPools = parsed?.pools || [];

          // Convert RPC format to standard format
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
          console.log('[useAlkanesTokenPairs] RPC returned', poolsArray.length, 'pools');
        } catch (e) {
          console.warn('[useAlkanesTokenPairs] RPC fallback failed:', e);
        }
      }

      // Method 4: If still empty, try pool scan via get-pool-by-id for block 2 alkanes
      if (poolsArray.length === 0) {
        try {
          console.log('[useAlkanesTokenPairs] Trying pool scan fallback...');

          // Fetch all alkanes to find block 2 candidates
          const alkanesResponse = await fetch(`${apiUrl}/get-alkanes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: 1, limit: 500 }),
          });
          const alkanesData = await alkanesResponse.json();
          const allTokens = alkanesData?.data?.tokens || [];
          const block2Alkanes = allTokens.filter((t: any) => t.id?.block === '2');

          console.log('[useAlkanesTokenPairs] Checking', block2Alkanes.length, 'block 2 alkanes');

          // Check each block 2 alkane via get-pool-by-id in parallel
          const poolPromises = block2Alkanes.map(async (alkane: any) => {
            try {
              const poolResponse = await fetch(`${apiUrl}/get-pool-by-id`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ poolId: { block: alkane.id.block, tx: alkane.id.tx } }),
              });
              const poolData = await poolResponse.json();
              if (poolData?.statusCode === 404 || poolData?.error) return null;
              const p = poolData?.data || poolData;
              if (!p?.pool_block_id || !p?.pool_tx_id) return null;
              return p;
            } catch {
              return null;
            }
          });

          const poolResults = await Promise.all(poolPromises);
          poolsArray = poolResults.filter((p): p is any => p !== null);
          console.log('[useAlkanesTokenPairs] Pool scan found', poolsArray.length, 'pools');
        } catch (e) {
          console.warn('[useAlkanesTokenPairs] Pool scan failed:', e);
        }
      }

      console.log('[useAlkanesTokenPairs] Total pools found:', poolsArray.length, 'for token:', normalizedId);

      // Filter pools that contain this token
      const matchingPools: AlkanesTokenPair[] = [];

      for (const p of poolsArray) {
        const pool = poolToObject(p);

        // Extract token IDs from response
        // API returns: token0_block_id, token0_tx_id, token1_block_id, token1_tx_id
        const token0Id = pool.token0_id ||
          (pool.token0_block_id && pool.token0_tx_id ? `${pool.token0_block_id}:${pool.token0_tx_id}` : '');
        const token1Id = pool.token1_id ||
          (pool.token1_block_id && pool.token1_tx_id ? `${pool.token1_block_id}:${pool.token1_tx_id}` : '');

        // Check if this pool contains the requested token
        if (token0Id === normalizedId || token1Id === normalizedId) {
          // Extract reserves (token amounts)
          const token0Amount = pool.token0_amount || pool.reserve0 || '0';
          const token1Amount = pool.token1_amount || pool.reserve1 || '0';

          // Extract token names from pool_name (format: "TOKEN0 / TOKEN1 LP")
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

          // Parse pool ID
          const poolIdBlock = pool.pool_block_id || pool.pool_id?.split(':')[0] || 0;
          const poolIdTx = pool.pool_tx_id || pool.pool_id?.split(':')[1] || 0;

          matchingPools.push({
            token0: {
              id: token0Id,
              token0Amount,
              alkaneId: parseAlkaneId(token0Id || '0:0'),
              name: token0Name,
              symbol: token0Name,
            },
            token1: {
              id: token1Id,
              token1Amount,
              alkaneId: parseAlkaneId(token1Id || '0:0'),
              name: token1Name,
              symbol: token1Name,
            },
            poolId: {
              block: poolIdBlock,
              tx: poolIdTx,
            },
            poolName,
          } as AlkanesTokenPair);

          console.log('[useAlkanesTokenPairs] Found matching pool:', {
            poolId: `${poolIdBlock}:${poolIdTx}`,
            token0: { id: token0Id, amount: token0Amount },
            token1: { id: token1Id, amount: token1Amount },
          });
        }
      }

      return matchingPools;
    },
  });
}
