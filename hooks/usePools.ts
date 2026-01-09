import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Subfrost API key for higher rate limits (used in URL path)
const SUBFROST_API_KEY = 'd5ccdb288adb17eeab785a15766cc897';

// Network to API base URL mapping for REST API (Data API)
// API key is embedded in URL path for authenticated access
const NETWORK_API_URLS: Record<string, string> = {
  mainnet: `https://mainnet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  testnet: `https://testnet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  signet: `https://signet.subfrost.io/v4/${SUBFROST_API_KEY}`,
  regtest: `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
  oylnet: `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
  'regtest-local': 'http://localhost:4000',
  'subfrost-regtest': `https://regtest.subfrost.io/v4/${SUBFROST_API_KEY}`,
};

export type UsePoolsParams = {
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'tvl' | 'volume1d' | 'volume30d' | 'apr';
  order?: 'asc' | 'desc';
};

export type PoolsListItem = {
  id: string;
  pairLabel: string;
  token0: { id: string; symbol: string; name?: string; iconUrl?: string };
  token1: { id: string; symbol: string; name?: string; iconUrl?: string };
  tvlUsd?: number;
  token0TvlUsd?: number;
  token1TvlUsd?: number;
  vol24hUsd?: number;
  vol7dUsd?: number;
  vol30dUsd?: number;
  apr?: number;
};

// Token IDs for TVL calculation
const FRBTC_TOKEN_ID = '32:0';

/**
 * Calculate TVL in USD from pool reserves
 *
 * For a constant product AMM (x * y = k), both sides are always equal in USD value.
 * We only need to find the USD value of one side (using a known-price token like frBTC or bUSD)
 * and the other side is equal.
 */
function calculateTvlFromReserves(
  token0Id: string,
  token1Id: string,
  _token0Amount: string,
  token1Amount: string,
  btcPrice: number | undefined,
  busdTokenId: string
): { tvlUsd: number; token0TvlUsd: number; token1TvlUsd: number } {
  // Token decimals (assuming 8 for all alkane tokens)
  const decimals = 8;
  const token1Value = Number(token1Amount) / Math.pow(10, decimals);

  // Find the USD price of token1 (the quote token)
  // frBTC (32:0) = BTC price, bUSD = $1
  let token1PriceUsd = 0;
  if (token1Id === FRBTC_TOKEN_ID && btcPrice) {
    token1PriceUsd = btcPrice;
  } else if (token1Id === busdTokenId) {
    token1PriceUsd = 1; // $1 per bUSD
  } else if (token0Id === FRBTC_TOKEN_ID && btcPrice) {
    // If token0 is the known token, derive token1's price from reserves
    // For now, just use the 50/50 assumption
    const token0Value = Number(_token0Amount) / Math.pow(10, decimals);
    const token0TvlUsd = token0Value * btcPrice;
    return { tvlUsd: token0TvlUsd * 2, token0TvlUsd, token1TvlUsd: token0TvlUsd };
  } else if (token0Id === busdTokenId) {
    const token0Value = Number(_token0Amount) / Math.pow(10, decimals);
    const token0TvlUsd = token0Value; // $1 per bUSD
    return { tvlUsd: token0TvlUsd * 2, token0TvlUsd, token1TvlUsd: token0TvlUsd };
  }

  // If we couldn't determine a price, return zeros
  if (token1PriceUsd === 0) {
    return { tvlUsd: 0, token0TvlUsd: 0, token1TvlUsd: 0 };
  }

  // In a constant product AMM, both sides are equal in USD value
  const token1TvlUsd = token1Value * token1PriceUsd;
  const token0TvlUsd = token1TvlUsd; // Equal by AMM design

  const tvlUsd = token0TvlUsd + token1TvlUsd;
  return { tvlUsd, token0TvlUsd, token1TvlUsd };
}

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID, BUSD_ALKANE_ID } = getConfig(network);
  const { data: btcPrice } = useBtcPrice();
  const { provider } = useAlkanesSDK();

  return useQuery<{ items: PoolsListItem[]; total: number }>({
    queryKey: [
      'pools',
      network,
      params.search ?? '',
      params.limit ?? 100,
      params.offset ?? 0,
      params.sortBy ?? 'tvl',
      params.order ?? 'desc',
      btcPrice ?? 0, // Include btcPrice in key so TVL recalculates when price updates
    ],
    staleTime: 120_000,
    // Enable as soon as we have network info - BTC price is optional for TVL calculation
    enabled: !!network && !!ALKANE_FACTORY_ID,
    queryFn: async () => {
      const items: PoolsListItem[] = [];

      try {
        // Parse factory ID into block and tx components
        const [factoryBlock, factoryTx] = ALKANE_FACTORY_ID.split(':');

        console.log('[usePools] Fetching pools for factory:', ALKANE_FACTORY_ID, 'on network:', network);

        // Use REST API directly for reliable pool data
        const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
        console.log('[usePools] API URL:', `${apiUrl}/get-pools`);

        const response = await fetch(`${apiUrl}/get-pools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factoryId: { block: factoryBlock, tx: factoryTx }
          }),
        });

        console.log('[usePools] Response status:', response.status);

        // Check if response contains an error (some APIs return 200 with error in body)
        const poolsResult = await response.json();

        if (!response.ok || poolsResult?.error || poolsResult?.statusCode >= 400) {
          console.warn('[usePools] REST API failed, trying RPC fallback:', poolsResult?.error || response.status);
          throw new Error(poolsResult?.error || `API request failed: ${response.status}`);
        }

        console.log('[usePools] Got pools result:', poolsResult);

        // dataApiGetPools returns { data: { pools: [...] } } or { pools: [...] } or array directly
        const rawData = poolsResult?.data?.pools || poolsResult?.data || poolsResult?.pools || poolsResult || [];
        const poolsArray = Array.isArray(rawData) ? rawData : [];

        console.log('[usePools] Parsing', poolsArray.length, 'pools');

        for (const p of poolsArray) {
          // API returns fields like: pool_block_id, pool_tx_id, token0_block_id, token0_tx_id, pool_name
          // Construct IDs from block:tx format
          const poolId = p.pool_id || (p.pool_block_id && p.pool_tx_id ? `${p.pool_block_id}:${p.pool_tx_id}` : p.id || '');
          const token0Id = p.token0_id || (p.token0_block_id && p.token0_tx_id ? `${p.token0_block_id}:${p.token0_tx_id}` : '');
          const token1Id = p.token1_id || (p.token1_block_id && p.token1_tx_id ? `${p.token1_block_id}:${p.token1_tx_id}` : '');

          // Extract token names from pool_name (format: "TOKEN0 / TOKEN1 LP")
          let token0Name = '';
          let token1Name = '';
          const poolName = p.pool_name || '';
          if (poolName) {
            const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
            if (match) {
              token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
              token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
            }
          }

          // Fall back to other field names if pool_name parsing didn't work
          if (!token0Name) {
            token0Name = (p.token0_name || p.token0_symbol || p.token0?.name || p.token0?.symbol || '').replace('SUBFROST BTC', 'frBTC');
          }
          if (!token1Name) {
            token1Name = (p.token1_name || p.token1_symbol || p.token1?.name || p.token1?.symbol || '').replace('SUBFROST BTC', 'frBTC');
          }

          // Skip pools without valid token IDs or names
          if (!poolId || !token0Id || !token1Id || !token0Name || !token1Name) {
            console.log('[usePools] Skipping incomplete pool:', { poolId, token0Id, token1Id, token0Name, token1Name, raw: p });
            continue;
          }

          // Parse token IDs for icon URLs
          const [t0Block, t0Tx] = token0Id.split(':');
          const [t1Block, t1Tx] = token1Id.split(':');
          const token0IconUrl = t0Block && t0Tx
            ? `https://asset.oyl.gg/alkanes/${network}/${t0Block}-${t0Tx}.png`
            : '';
          const token1IconUrl = t1Block && t1Tx
            ? `https://asset.oyl.gg/alkanes/${network}/${t1Block}-${t1Tx}.png`
            : '';

          // Get TVL from API response, or calculate from reserves
          let tvlUsd = p.tvl_usd || p.tvlUsd || (p.token0_tvl_usd ?? 0) + (p.token1_tvl_usd ?? 0) || 0;
          let token0TvlUsd = p.token0_tvl_usd || 0;
          let token1TvlUsd = p.token1_tvl_usd || 0;

          // If no TVL from API, calculate from reserves using BTC price
          if (tvlUsd === 0 && btcPrice) {
            const calculated = calculateTvlFromReserves(
              token0Id,
              token1Id,
              p.token0_amount || '0',
              p.token1_amount || '0',
              btcPrice,
              BUSD_ALKANE_ID
            );
            tvlUsd = calculated.tvlUsd;
            token0TvlUsd = calculated.token0TvlUsd;
            token1TvlUsd = calculated.token1TvlUsd;
          }

          const vol24hUsd = p.volume_1d_usd || p.volume1dUsd || p.poolVolume1dInUsd || 0;
          const vol30dUsd = p.volume_30d_usd || p.volume30dUsd || p.poolVolume30dInUsd || 0;
          const apr = p.apr || p.poolApr || 0;

          items.push({
            id: poolId,
            pairLabel: `${token0Name} / ${token1Name} LP`,
            token0: { id: token0Id, symbol: token0Name, name: token0Name, iconUrl: token0IconUrl },
            token1: { id: token1Id, symbol: token1Name, name: token1Name, iconUrl: token1IconUrl },
            tvlUsd,
            token0TvlUsd,
            token1TvlUsd,
            vol24hUsd,
            vol7dUsd: 0,
            vol30dUsd,
            apr,
          });
        }

        console.log('[usePools] Parsed', items.length, 'valid pools');

        // NOTE: We use pool_name from the API as the source of truth for token symbols
        // instead of alkanesReflect(). The indexer's pool_name reflects the actual
        // on-chain contract symbols, while alkanesReflect() can return stale/incorrect data.

        // Apply search filter if specified
        let filtered = items;
        if (params.search) {
          const searchLower = params.search.toLowerCase();
          filtered = items.filter(
            (p) =>
              p.pairLabel.toLowerCase().includes(searchLower) ||
              p.token0.symbol.toLowerCase().includes(searchLower) ||
              p.token1.symbol.toLowerCase().includes(searchLower)
          );
        }

        // Sort by TVL desc unless specified otherwise
        const sorted = [...filtered].sort((a, b) =>
          params.order === 'asc'
            ? (a.tvlUsd ?? 0) - (b.tvlUsd ?? 0)
            : (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)
        );

        // Apply pagination
        const start = params.offset ?? 0;
        const end = start + (params.limit ?? 100);
        const paginated = sorted.slice(start, end);

        return { items: paginated, total: sorted.length };
      } catch (error) {
        console.warn('[usePools] REST API error, trying RPC fallback:', error);

        // =====================================================================
        // RPC FALLBACK: Use alkanesGetAllPoolsWithDetails when REST API fails
        //
        // This fallback is necessary on networks like regtest where the
        // PoolState database table may not exist. The WASM provider's
        // alkanesGetAllPoolsWithDetails method fetches pool data directly
        // from the Alkanes indexer via RPC calls.
        // =====================================================================
        if (!provider) {
          console.error('[usePools] No provider available for RPC fallback');
          return { items: [], total: 0 };
        }

        try {
          console.log('[usePools] Using RPC fallback: alkanesGetAllPoolsWithDetails');
          const rpcResult = await provider.alkanesGetAllPoolsWithDetails(ALKANE_FACTORY_ID);
          console.log('[usePools] RPC result:', rpcResult);

          // Parse result - may be JSON string or object
          const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
          const pools = parsed?.pools || [];

          console.log('[usePools] RPC returned', pools.length, 'pools');

          for (const p of pools) {
            // RPC returns: pool_id_block, pool_id_tx, details: { token_a_block, token_a_tx, ... }
            const poolId = `${p.pool_id_block}:${p.pool_id_tx}`;
            const details = p.details || {};

            const token0Id = details.token_a_block != null && details.token_a_tx != null
              ? `${details.token_a_block}:${details.token_a_tx}`
              : '';
            const token1Id = details.token_b_block != null && details.token_b_tx != null
              ? `${details.token_b_block}:${details.token_b_tx}`
              : '';

            // Get token names from details or pool_name
            let token0Name = (details.token_a_name || '').replace('SUBFROST BTC', 'frBTC');
            let token1Name = (details.token_b_name || '').replace('SUBFROST BTC', 'frBTC');

            // Try to parse from pool_name if names not available
            if ((!token0Name || !token1Name) && details.pool_name) {
              const match = details.pool_name.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
              if (match) {
                token0Name = token0Name || match[1].trim().replace('SUBFROST BTC', 'frBTC');
                token1Name = token1Name || match[2].trim().replace('SUBFROST BTC', 'frBTC');
              }
            }

            // Skip incomplete pools
            if (!poolId || !token0Id || !token1Id || !token0Name || !token1Name) {
              console.log('[usePools] Skipping incomplete RPC pool:', { poolId, token0Id, token1Id, token0Name, token1Name });
              continue;
            }

            // Parse token IDs for icon URLs
            const [t0Block, t0Tx] = token0Id.split(':');
            const [t1Block, t1Tx] = token1Id.split(':');
            const token0IconUrl = t0Block && t0Tx
              ? `https://asset.oyl.gg/alkanes/${network}/${t0Block}-${t0Tx}.png`
              : '';
            const token1IconUrl = t1Block && t1Tx
              ? `https://asset.oyl.gg/alkanes/${network}/${t1Block}-${t1Tx}.png`
              : '';

            // Calculate TVL from reserves if available
            let tvlUsd = 0;
            let token0TvlUsd = 0;
            let token1TvlUsd = 0;

            if (btcPrice && (details.reserve_a || details.reserve_b)) {
              const calculated = calculateTvlFromReserves(
                token0Id,
                token1Id,
                details.reserve_a || '0',
                details.reserve_b || '0',
                btcPrice,
                BUSD_ALKANE_ID
              );
              tvlUsd = calculated.tvlUsd;
              token0TvlUsd = calculated.token0TvlUsd;
              token1TvlUsd = calculated.token1TvlUsd;
            }

            items.push({
              id: poolId,
              pairLabel: `${token0Name} / ${token1Name} LP`,
              token0: { id: token0Id, symbol: token0Name, name: token0Name, iconUrl: token0IconUrl },
              token1: { id: token1Id, symbol: token1Name, name: token1Name, iconUrl: token1IconUrl },
              tvlUsd,
              token0TvlUsd,
              token1TvlUsd,
              vol24hUsd: 0, // RPC doesn't provide volume data
              vol7dUsd: 0,
              vol30dUsd: 0,
              apr: 0, // RPC doesn't provide APR data
            });
          }

          console.log('[usePools] RPC fallback parsed', items.length, 'valid pools');

          // Apply search filter, sorting, and pagination (same as REST path)
          let filtered = items;
          if (params.search) {
            const searchLower = params.search.toLowerCase();
            filtered = items.filter(
              (p) =>
                p.pairLabel.toLowerCase().includes(searchLower) ||
                p.token0.symbol.toLowerCase().includes(searchLower) ||
                p.token1.symbol.toLowerCase().includes(searchLower)
            );
          }

          const sorted = [...filtered].sort((a, b) =>
            params.order === 'asc'
              ? (a.tvlUsd ?? 0) - (b.tvlUsd ?? 0)
              : (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)
          );

          const start = params.offset ?? 0;
          const end = start + (params.limit ?? 100);
          const paginated = sorted.slice(start, end);

          return { items: paginated, total: sorted.length };
        } catch (rpcError) {
          console.error('[usePools] RPC fallback also failed:', rpcError);

          // =====================================================================
          // POOL SCAN FALLBACK: Query alkanes on block 2 via get-pool-by-id
          //
          // When both REST API and alkanesGetAllPoolsWithDetails fail (e.g., on
          // regtest where PoolState table doesn't exist and metashrew is unavailable),
          // we first fetch all alkanes, filter to block 2 (where pools are created),
          // then check each one via get-pool-by-id in parallel.
          // =====================================================================
          console.log('[usePools] Trying pool scan fallback via get-pool-by-id');

          const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
          const scannedPools: PoolsListItem[] = [];

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
            console.log('[usePools] Found', block2Alkanes.length, 'alkanes on block 2 to check');

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

              const poolId = `${p.pool_block_id}:${p.pool_tx_id}`;
              const token0Id = `${p.token0_block_id}:${p.token0_tx_id}`;
              const token1Id = `${p.token1_block_id}:${p.token1_tx_id}`;

              // Parse token names from pool_name
              let token0Name = '';
              let token1Name = '';
              const poolName = p.pool_name || '';
              if (poolName) {
                const match = poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
                if (match) {
                  token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
                  token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
                }
              }

              // Skip incomplete pools
              if (!token0Name || !token1Name) {
                continue;
              }

              // Parse token IDs for icon URLs
              const [t0Block, t0Tx] = token0Id.split(':');
              const [t1Block, t1Tx] = token1Id.split(':');
              const token0IconUrl = t0Block && t0Tx
                ? `https://asset.oyl.gg/alkanes/${network}/${t0Block}-${t0Tx}.png`
                : '';
              const token1IconUrl = t1Block && t1Tx
                ? `https://asset.oyl.gg/alkanes/${network}/${t1Block}-${t1Tx}.png`
                : '';

              // Calculate TVL from reserves if available
              let tvlUsd = 0;
              let token0TvlUsd = 0;
              let token1TvlUsd = 0;

              if (btcPrice && (p.token0_amount || p.token1_amount)) {
                const calculated = calculateTvlFromReserves(
                  token0Id,
                  token1Id,
                  p.token0_amount || '0',
                  p.token1_amount || '0',
                  btcPrice,
                  BUSD_ALKANE_ID
                );
                tvlUsd = calculated.tvlUsd;
                token0TvlUsd = calculated.token0TvlUsd;
                token1TvlUsd = calculated.token1TvlUsd;
              }

              scannedPools.push({
                id: poolId,
                pairLabel: `${token0Name} / ${token1Name} LP`,
                token0: { id: token0Id, symbol: token0Name, name: token0Name, iconUrl: token0IconUrl },
                token1: { id: token1Id, symbol: token1Name, name: token1Name, iconUrl: token1IconUrl },
                tvlUsd,
                token0TvlUsd,
                token1TvlUsd,
                vol24hUsd: 0,
                vol7dUsd: 0,
                vol30dUsd: 0,
                apr: 0,
              });

              console.log('[usePools] Found pool via scan:', poolId, poolName);
            }
          } catch (scanError) {
            console.error('[usePools] Pool scan failed:', scanError);
          }

          console.log('[usePools] Pool scan found', scannedPools.length, 'pools');

          if (scannedPools.length > 0) {
            // Apply search filter, sorting, and pagination
            let filtered = scannedPools;
            if (params.search) {
              const searchLower = params.search.toLowerCase();
              filtered = scannedPools.filter(
                (p) =>
                  p.pairLabel.toLowerCase().includes(searchLower) ||
                  p.token0.symbol.toLowerCase().includes(searchLower) ||
                  p.token1.symbol.toLowerCase().includes(searchLower)
              );
            }

            const sorted = [...filtered].sort((a, b) =>
              params.order === 'asc'
                ? (a.tvlUsd ?? 0) - (b.tvlUsd ?? 0)
                : (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0)
            );

            const start = params.offset ?? 0;
            const end = start + (params.limit ?? 100);
            const paginated = sorted.slice(start, end);

            return { items: paginated, total: sorted.length };
          }

          return { items: [], total: 0 };
        }
      }
    },
  });
}
