/**
 * usePools - Fetch pool data using @alkanes/ts-sdk
 *
 * Uses ts-sdk methods exclusively with a fallback chain:
 * 1. dataApiGetPools (Data API - more reliable)
 * 2. alkanesGetAllPoolsWithDetails (RPC simulate)
 *
 * @see Blueprint: Phase 2 - Pool Data Migration
 */
import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';

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

/**
 * Build icon URL for a token
 */
function getTokenIconUrl(tokenId: string, network: string): string {
  const [block, tx] = tokenId.split(':');
  if (block && tx) {
    return `https://asset.oyl.gg/alkanes/${network}/${block}-${tx}.png`;
  }
  return '';
}

/**
 * Get token symbol from known tokens or extract from name
 */
function getTokenSymbol(tokenId: string, rawName?: string): string {
  // Check KNOWN_TOKENS first
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.symbol;

  // Clean up raw name
  if (rawName) {
    return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  }

  // Fallback to ID
  return tokenId.split(':')[1] || 'UNK';
}

/**
 * Extract pools array from various response formats (object, Map, array)
 */
function extractPoolsArray(response: any): any[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (response instanceof Map) {
    const pools = response.get('pools');
    return Array.isArray(pools) ? pools : [];
  }
  if (response.pools && Array.isArray(response.pools)) return response.pools;
  if (response.data?.pools && Array.isArray(response.data.pools)) return response.data.pools;
  if (response.data && Array.isArray(response.data)) return response.data;
  return [];
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
    // Retry transient failures (network issues, indexer hiccups)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    // Enable as soon as we have network info and provider - BTC price is optional for TVL calculation
    enabled: !!network && !!ALKANE_FACTORY_ID && !!provider,
    queryFn: async () => {
      console.log('[usePools] Fetching pools via ts-sdk for factory:', ALKANE_FACTORY_ID);

      let rawPools: any[] = [];

      // =====================================================================
      // Method 1: dataApiGetPools (Data API - more reliable)
      // =====================================================================
      try {
        console.log('[usePools] Trying dataApiGetPools...');
        const dataApiResult = await provider!.dataApiGetPools(ALKANE_FACTORY_ID);
        rawPools = extractPoolsArray(dataApiResult);
        console.log('[usePools] dataApiGetPools returned', rawPools.length, 'pools');
      } catch (e) {
        console.warn('[usePools] dataApiGetPools failed:', e);
      }

      // =====================================================================
      // Method 2: alkanesGetAllPoolsWithDetails (RPC simulate)
      // =====================================================================
      if (rawPools.length === 0) {
        try {
          console.log('[usePools] Trying alkanesGetAllPoolsWithDetails...');
          const rpcResult = await provider!.alkanesGetAllPoolsWithDetails(ALKANE_FACTORY_ID);
          const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
          const rpcPools = parsed?.pools || [];

          // Convert RPC format to standard format
          rawPools = rpcPools.map((p: any) => ({
            pool_block_id: p.pool_id_block,
            pool_tx_id: p.pool_id_tx,
            token0_block_id: p.details?.token_a_block,
            token0_tx_id: p.details?.token_a_tx,
            token1_block_id: p.details?.token_b_block,
            token1_tx_id: p.details?.token_b_tx,
            token0_amount: p.details?.reserve_a || '0',
            token1_amount: p.details?.reserve_b || '0',
            pool_name: p.details?.pool_name || '',
            token0_name: p.details?.token_a_name || '',
            token1_name: p.details?.token_b_name || '',
          }));
          console.log('[usePools] alkanesGetAllPoolsWithDetails returned', rawPools.length, 'pools');
        } catch (e) {
          console.warn('[usePools] alkanesGetAllPoolsWithDetails failed:', e);
        }
      }

      // If both methods failed, throw error for React Query to handle
      if (rawPools.length === 0) {
        console.error('[usePools] All ts-sdk methods failed to return pools');
        throw new Error('Failed to fetch pools from ts-sdk');
      }

      // Process raw pools into PoolsListItem format
      const items: PoolsListItem[] = [];

      for (const p of rawPools) {
        // Handle both Data API format and RPC format
        const poolId = p.pool_id || `${p.pool_block_id}:${p.pool_tx_id}`;

        // Data API uses token0/token1, RPC uses token_a/token_b
        const token0Id = p.token0_id || (p.token0_block_id != null && p.token0_tx_id != null
          ? `${p.token0_block_id}:${p.token0_tx_id}`
          : '');
        const token1Id = p.token1_id || (p.token1_block_id != null && p.token1_tx_id != null
          ? `${p.token1_block_id}:${p.token1_tx_id}`
          : '');

        // Get token names
        let token0Name = getTokenSymbol(token0Id, p.token0_name);
        let token1Name = getTokenSymbol(token1Id, p.token1_name);

        // Try to parse from pool_name if names not available
        if ((!token0Name || token0Name === 'UNK' || !token1Name || token1Name === 'UNK') && p.pool_name) {
          const match = p.pool_name.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
          if (match) {
            if (!token0Name || token0Name === 'UNK') {
              token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
            }
            if (!token1Name || token1Name === 'UNK') {
              token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
            }
          }
        }

        // Skip incomplete pools
        if (!poolId || !token0Id || !token1Id || !token0Name || !token1Name) {
          console.log('[usePools] Skipping incomplete pool:', { poolId, token0Id, token1Id, token0Name, token1Name });
          continue;
        }

        // Calculate TVL from reserves if available
        let tvlUsd = 0;
        let token0TvlUsd = 0;
        let token1TvlUsd = 0;

        const reserve0 = p.token0_amount || p.reserve_a || '0';
        const reserve1 = p.token1_amount || p.reserve_b || '0';

        if (btcPrice && (reserve0 !== '0' || reserve1 !== '0')) {
          const calculated = calculateTvlFromReserves(
            token0Id,
            token1Id,
            reserve0,
            reserve1,
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
          token0: {
            id: token0Id,
            symbol: token0Name,
            name: token0Name,
            iconUrl: getTokenIconUrl(token0Id, network),
          },
          token1: {
            id: token1Id,
            symbol: token1Name,
            name: token1Name,
            iconUrl: getTokenIconUrl(token1Id, network),
          },
          tvlUsd,
          token0TvlUsd,
          token1TvlUsd,
          vol24hUsd: 0, // ts-sdk doesn't provide volume data yet
          vol7dUsd: 0,
          vol30dUsd: 0,
          apr: 0, // ts-sdk doesn't provide APR data yet
        });
      }

      console.log('[usePools] Processed', items.length, 'valid pools');

      // Resolve names for unknown tokens via alkanesReflect (best-effort, never blocks pool display)
      try {
        const tokensToReflect = new Map<string, { symbol: string; name?: string }>();
        for (const item of items) {
          for (const token of [item.token0, item.token1]) {
            if (!KNOWN_TOKENS[token.id] && !tokensToReflect.has(token.id) && /^\d+$/.test(token.symbol)) {
              tokensToReflect.set(token.id, token);
            }
          }
        }

        if (tokensToReflect.size > 0 && provider) {
          console.log('[usePools] Resolving names for', tokensToReflect.size, 'unknown tokens via alkanesReflect');
          const reflectWithTimeout = (id: string): Promise<{ name?: string; symbol?: string } | null> =>
            Promise.race([
              provider.alkanesReflect(id) as Promise<{ name?: string; symbol?: string } | null>,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
          await Promise.allSettled(
            Array.from(tokensToReflect.entries()).map(async ([id]) => {
              try {
                const reflection = await reflectWithTimeout(id);
                if (reflection?.name || reflection?.symbol) {
                  tokensToReflect.set(id, {
                    symbol: reflection.symbol || reflection.name || id,
                    name: reflection.name || reflection.symbol || id,
                  });
                }
              } catch (e) {
                console.log(`[usePools] alkanesReflect failed for ${id}:`, e);
              }
            })
          );

          // Apply resolved names back to all pool items
          for (const item of items) {
            for (const token of [item.token0, item.token1]) {
              const resolved = tokensToReflect.get(token.id);
              if (resolved && resolved.symbol !== token.symbol) {
                token.symbol = resolved.symbol;
                token.name = resolved.name;
              }
            }
            item.pairLabel = `${item.token0.symbol} / ${item.token1.symbol} LP`;
          }
        }
      } catch (reflectError) {
        console.warn('[usePools] Token name resolution failed, using fallback names:', reflectError);
      }

      // Apply search filter, sorting, and pagination
      return applyFiltersAndPagination(items, params);
    },
  });
}

/**
 * Apply search filter, sorting, and pagination to pool items
 */
function applyFiltersAndPagination(
  items: PoolsListItem[],
  params: UsePoolsParams
): { items: PoolsListItem[]; total: number } {
  // Apply search filter
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

  // Sort by TVL (default) or other fields
  const sortField = params.sortBy ?? 'tvl';
  const sorted = [...filtered].sort((a, b) => {
    let aVal = 0;
    let bVal = 0;

    switch (sortField) {
      case 'tvl':
        aVal = a.tvlUsd ?? 0;
        bVal = b.tvlUsd ?? 0;
        break;
      case 'volume1d':
        aVal = a.vol24hUsd ?? 0;
        bVal = b.vol24hUsd ?? 0;
        break;
      case 'volume30d':
        aVal = a.vol30dUsd ?? 0;
        bVal = b.vol30dUsd ?? 0;
        break;
      case 'apr':
        aVal = a.apr ?? 0;
        bVal = b.apr ?? 0;
        break;
    }

    return params.order === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Apply pagination
  const start = params.offset ?? 0;
  const end = start + (params.limit ?? 100);
  const paginated = sorted.slice(start, end);

  return { items: paginated, total: sorted.length };
}
