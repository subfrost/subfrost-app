import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { useBtcPrice } from '@/hooks/useBtcPrice';

// Network to API base URL mapping for REST API (using subfrost API key)
const NETWORK_API_URLS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
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
const BUSD_TOKEN_ID_MAINNET = '2:56801';

/**
 * Calculate TVL in USD from pool reserves
 */
function calculateTvlFromReserves(
  token0Id: string,
  token1Id: string,
  token0Amount: string,
  token1Amount: string,
  btcPrice: number | undefined,
  busdTokenId: string
): { tvlUsd: number; token0TvlUsd: number; token1TvlUsd: number } {
  // Default values
  let token0TvlUsd = 0;
  let token1TvlUsd = 0;

  // Token decimals (assuming 8 for all alkane tokens)
  const decimals = 8;
  const token0Value = Number(token0Amount) / Math.pow(10, decimals);
  const token1Value = Number(token1Amount) / Math.pow(10, decimals);

  // Determine token prices based on token IDs
  // frBTC (32:0) = BTC price
  // bUSD (2:56801) = $1
  // Other tokens: estimate from pool ratio if paired with a known token

  // Get price for token0
  if (token0Id === FRBTC_TOKEN_ID && btcPrice) {
    token0TvlUsd = token0Value * btcPrice;
  } else if (token0Id === busdTokenId) {
    token0TvlUsd = token0Value; // $1 per bUSD
  }

  // Get price for token1
  if (token1Id === FRBTC_TOKEN_ID && btcPrice) {
    token1TvlUsd = token1Value * btcPrice;
  } else if (token1Id === busdTokenId) {
    token1TvlUsd = token1Value; // $1 per bUSD
  }

  // For pools with one known-price token and one unknown,
  // estimate the unknown token's value as equal to the known token's value (50/50 pool assumption)
  if (token0TvlUsd > 0 && token1TvlUsd === 0) {
    token1TvlUsd = token0TvlUsd; // Assume 50/50 pool
  } else if (token1TvlUsd > 0 && token0TvlUsd === 0) {
    token0TvlUsd = token1TvlUsd; // Assume 50/50 pool
  }

  const tvlUsd = token0TvlUsd + token1TvlUsd;
  return { tvlUsd, token0TvlUsd, token1TvlUsd };
}

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
  const { ALKANE_FACTORY_ID, BUSD_ALKANE_ID } = getConfig(network);
  const { data: btcPrice } = useBtcPrice();

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
    // Enable as soon as we have network info and BTC price - we use REST API directly
    enabled: !!network && !!ALKANE_FACTORY_ID && btcPrice !== undefined,
    queryFn: async () => {

      try {
        // Parse factory ID into block and tx components
        const [factoryBlock, factoryTx] = ALKANE_FACTORY_ID.split(':');

        // Use REST API directly for reliable pool data
        const apiUrl = NETWORK_API_URLS[network] || NETWORK_API_URLS.mainnet;
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

        const poolsResult = await response.json();
        console.log('[usePools] Got pools result:', poolsResult);

        const items: PoolsListItem[] = [];

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
        console.error('[usePools] Error fetching pools:', error);
        return { items: [], total: 0 };
      }
    },
  });
}
