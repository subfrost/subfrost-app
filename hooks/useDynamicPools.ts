/**
 * useDynamicPools - Fetches pools dynamically from the REST API
 *
 * This hook uses the /v4/subfrost/get-pools endpoint to fetch all pools
 * with their details including token IDs and names.
 *
 * ## RPC Fallback
 *
 * When the REST API fails (e.g., on regtest where the PoolState database
 * table doesn't exist), this hook falls back to using the WASM provider's
 * alkanesGetAllPoolsWithDetails method which fetches pool data directly
 * from the Alkanes indexer via RPC calls.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Subfrost API key for higher rate limits (used in URL path)
const SUBFROST_API_KEY = 'd5ccdb288adb17eeab785a15766cc897';

// Network to API base URL mapping for REST API (Data API)
const NETWORK_API_URLS: Record<string, string> = {
  mainnet: `https://mainnet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  testnet: `https://testnet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  signet: `https://signet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  regtest: `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
  oylnet: `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
  'regtest-local': 'http://localhost:4000',
  'subfrost-regtest': `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
};

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

/**
 * Fetch all pools from factory using REST API
 */
export function useDynamicPools(options?: {
  chunk_size?: number;
  max_concurrent?: number;
  enabled?: boolean;
}) {
  const { network } = useWallet();
  const config = getConfig(network);
  const factoryId = config.ALKANE_FACTORY_ID; // e.g., "4:65522"
  const { provider } = useAlkanesSDK();

  const { enabled = true } = options || {};

  return useQuery<DynamicPoolsResult>({
    queryKey: ['dynamic-pools', network, factoryId],
    enabled: enabled && !!factoryId && !!network,
    staleTime: 2 * 60 * 1000, // 2 minutes
    queryFn: async () => {
      // Parse factory ID into block and tx components
      const [factoryBlock, factoryTx] = factoryId.split(':');

      try {
        // Use REST API directly
        const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
        const response = await fetch(`${apiUrl}/get-pools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factoryId: { block: factoryBlock, tx: factoryTx }
          }),
        });

        const result = await response.json();

        // Check for API errors (some return 200 with error in body)
        if (!response.ok || result?.error || result?.statusCode >= 400) {
          console.warn('[useDynamicPools] REST API failed, trying RPC fallback:', result?.error || response.status);
          throw new Error(result?.error || `API request failed: ${response.status}`);
        }

        console.log('[useDynamicPools] Got pools result:', result);

        // Transform REST API response to DynamicPoolsResult format
        const rawPools = result?.data?.pools || result?.pools || result?.data || [];
        const pools: DynamicPool[] = [];

        for (const p of rawPools) {
          // Extract pool name parts for token names
          let tokenAName = '';
          let tokenBName = '';
          const poolName = p.pool_name || '';
          if (poolName) {
            const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
            if (match) {
              tokenAName = match[1].trim();
              tokenBName = match[2].trim();
            }
          }

          pools.push({
            pool_id: `${p.pool_block_id}:${p.pool_tx_id}`,
            pool_id_block: parseInt(p.pool_block_id) || 0,
            pool_id_tx: parseInt(p.pool_tx_id) || 0,
            details: {
              token_a_block: parseInt(p.token0_block_id) || 0,
              token_a_tx: parseInt(p.token0_tx_id) || 0,
              token_b_block: parseInt(p.token1_block_id) || 0,
              token_b_tx: parseInt(p.token1_tx_id) || 0,
              token_a_name: tokenAName,
              token_b_name: tokenBName,
              reserve_a: p.token0_amount || '0',
              reserve_b: p.token1_amount || '0',
              pool_name: poolName,
            },
          });
        }

        return {
          total: pools.length,
          count: pools.length,
          pools,
        };
      } catch (error) {
        console.warn('[useDynamicPools] REST API error, trying RPC fallback:', error);

        // =====================================================================
        // RPC FALLBACK: Use alkanesGetAllPoolsWithDetails when REST API fails
        // =====================================================================
        if (!provider) {
          console.error('[useDynamicPools] No provider available for RPC fallback');
          return { total: 0, count: 0, pools: [] };
        }

        try {
          console.log('[useDynamicPools] Using RPC fallback: alkanesGetAllPoolsWithDetails');
          const rpcResult = await provider.alkanesGetAllPoolsWithDetails(factoryId);
          console.log('[useDynamicPools] RPC result:', rpcResult);

          // Parse result - may be JSON string or object
          const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
          const rpcPools = parsed?.pools || [];

          console.log('[useDynamicPools] RPC returned', rpcPools.length, 'pools');

          const pools: DynamicPool[] = [];

          for (const p of rpcPools) {
            const details = p.details || {};

            // Get token names from details or pool_name
            let tokenAName = (details.token_a_name || '').replace('SUBFROST BTC', 'frBTC');
            let tokenBName = (details.token_b_name || '').replace('SUBFROST BTC', 'frBTC');

            // Try to parse from pool_name if names not available
            if ((!tokenAName || !tokenBName) && details.pool_name) {
              const match = details.pool_name.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
              if (match) {
                tokenAName = tokenAName || match[1].trim().replace('SUBFROST BTC', 'frBTC');
                tokenBName = tokenBName || match[2].trim().replace('SUBFROST BTC', 'frBTC');
              }
            }

            pools.push({
              pool_id: `${p.pool_id_block}:${p.pool_id_tx}`,
              pool_id_block: p.pool_id_block || 0,
              pool_id_tx: p.pool_id_tx || 0,
              details: {
                token_a_block: details.token_a_block || 0,
                token_a_tx: details.token_a_tx || 0,
                token_b_block: details.token_b_block || 0,
                token_b_tx: details.token_b_tx || 0,
                token_a_name: tokenAName,
                token_b_name: tokenBName,
                reserve_a: details.reserve_a || '0',
                reserve_b: details.reserve_b || '0',
                pool_name: details.pool_name || '',
              },
            });
          }

          return {
            total: pools.length,
            count: pools.length,
            pools,
          };
        } catch (rpcError) {
          console.error('[useDynamicPools] RPC fallback also failed:', rpcError);

          // =====================================================================
          // POOL SCAN FALLBACK: Query alkanes on block 2 via get-pool-by-id
          //
          // When both REST API and alkanesGetAllPoolsWithDetails fail (e.g., on
          // regtest where PoolState table doesn't exist and metashrew is unavailable),
          // we first fetch all alkanes, filter to block 2 (where pools are created),
          // then check each one via get-pool-by-id in parallel.
          // =====================================================================
          console.log('[useDynamicPools] Trying pool scan fallback via get-pool-by-id');

          const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
          const scannedPools: DynamicPool[] = [];

          try {
            // Step 1: Fetch all alkanes to find which IDs exist on block 2
            const alkanesResponse = await fetch(`${apiUrl}/get-alkanes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ page: 1, limit: 500 }),
            });
            const alkanesData = await alkanesResponse.json();
            const allTokens = alkanesData?.data?.tokens || [];

            // Filter to block 2 alkanes only (where pools are created)
            const block2Alkanes = allTokens.filter((t: any) => t.id?.block === '2');
            console.log('[useDynamicPools] Found', block2Alkanes.length, 'alkanes on block 2 to check');

            // Step 2: Check each block 2 alkane via get-pool-by-id in parallel
            const poolPromises = block2Alkanes.map(async (alkane: any) => {
              try {
                const poolResponse = await fetch(`${apiUrl}/get-pool-by-id`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ poolId: { block: alkane.id.block, tx: alkane.id.tx } }),
                });

                const poolData = await poolResponse.json();

                // Skip if not a pool (404 response)
                if (poolData?.statusCode === 404 || poolData?.error) {
                  return null;
                }

                const p = poolData?.data || poolData;
                if (!p?.pool_block_id || !p?.pool_tx_id) {
                  return null;
                }

                return p;
              } catch {
                return null;
              }
            });

            const poolResults = await Promise.all(poolPromises);

            // Step 3: Process valid pools
            for (const p of poolResults) {
              if (!p) continue;

              // Parse token names from pool_name
              let tokenAName = '';
              let tokenBName = '';
              const poolName = p.pool_name || '';
              if (poolName) {
                const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
                if (match) {
                  tokenAName = match[1].trim().replace('SUBFROST BTC', 'frBTC');
                  tokenBName = match[2].trim().replace('SUBFROST BTC', 'frBTC');
                }
              }

              // Skip incomplete pools
              if (!tokenAName || !tokenBName) {
                continue;
              }

              scannedPools.push({
                pool_id: `${p.pool_block_id}:${p.pool_tx_id}`,
                pool_id_block: parseInt(p.pool_block_id) || 0,
                pool_id_tx: parseInt(p.pool_tx_id) || 0,
                details: {
                  token_a_block: parseInt(p.token0_block_id) || 0,
                  token_a_tx: parseInt(p.token0_tx_id) || 0,
                  token_b_block: parseInt(p.token1_block_id) || 0,
                  token_b_tx: parseInt(p.token1_tx_id) || 0,
                  token_a_name: tokenAName,
                  token_b_name: tokenBName,
                  reserve_a: p.token0_amount || '0',
                  reserve_b: p.token1_amount || '0',
                  pool_name: poolName,
                },
              });

              console.log('[useDynamicPools] Found pool via scan:', `${p.pool_block_id}:${p.pool_tx_id}`, poolName);
            }
          } catch (scanError) {
            console.error('[useDynamicPools] Pool scan failed:', scanError);
          }

          console.log('[useDynamicPools] Pool scan found', scannedPools.length, 'pools');

          return {
            total: scannedPools.length,
            count: scannedPools.length,
            pools: scannedPools,
          };
        }
      }
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
  
  const filteredPools = poolsQuery.data?.pools.filter((pool) => {
    // Parse pool details to check if tokens are in whitelist
    // This would need to be adapted based on the actual response format
    // For now, we'll just return all pools and let the UI filter
    return true;
  });

  return {
    ...poolsQuery,
    filteredPools: filteredPools || [],
  };
}
