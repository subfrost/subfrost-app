/**
 * usePools - Fetch pool data from OYL Alkanode API
 *
 * Primary: OYL Alkanode /get-all-pools-details (returns all pools with TVL, volume, APR)
 * Fallback: ts-sdk dataApiGetPools / alkanesGetAllPoolsWithDetails
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

// Token IDs for TVL calculation (used by SDK fallback)
const FRBTC_TOKEN_ID = '32:0';

// ============================================================================
// OYL Alkanode types
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
  token0TvlInUsd?: number | string;
  token1TvlInUsd?: number | string;
  poolVolume1dInUsd?: number | string;
  poolVolume7dInUsd?: number | string;
  poolVolume30dInUsd?: number | string;
  poolApr?: number | string;
}

function toNum(v: number | string | undefined | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate TVL in USD from pool reserves (SDK fallback only)
 */
function calculateTvlFromReserves(
  token0Id: string,
  token1Id: string,
  _token0Amount: string,
  token1Amount: string,
  btcPrice: number | undefined,
  busdTokenId: string
): { tvlUsd: number; token0TvlUsd: number; token1TvlUsd: number } {
  const decimals = 8;
  const token1Value = Number(token1Amount) / Math.pow(10, decimals);

  let token1PriceUsd = 0;
  if (token1Id === FRBTC_TOKEN_ID && btcPrice) {
    token1PriceUsd = btcPrice;
  } else if (token1Id === busdTokenId) {
    token1PriceUsd = 1;
  } else if (token0Id === FRBTC_TOKEN_ID && btcPrice) {
    const token0Value = Number(_token0Amount) / Math.pow(10, decimals);
    const token0TvlUsd = token0Value * btcPrice;
    return { tvlUsd: token0TvlUsd * 2, token0TvlUsd, token1TvlUsd: token0TvlUsd };
  } else if (token0Id === busdTokenId) {
    const token0Value = Number(_token0Amount) / Math.pow(10, decimals);
    const token0TvlUsd = token0Value;
    return { tvlUsd: token0TvlUsd * 2, token0TvlUsd, token1TvlUsd: token0TvlUsd };
  }

  if (token1PriceUsd === 0) {
    return { tvlUsd: 0, token0TvlUsd: 0, token1TvlUsd: 0 };
  }

  const token1TvlUsd = token1Value * token1PriceUsd;
  const token0TvlUsd = token1TvlUsd;
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
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.symbol;

  if (rawName) {
    return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  }

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

// ============================================================================
// OYL Alkanode fetch
// ============================================================================

async function fetchPoolsFromAlkanode(
  alkanodeUrl: string,
  factoryId: string,
  network: string,
): Promise<PoolsListItem[]> {
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

  const items: PoolsListItem[] = [];

  for (const p of pools) {
    const poolId = p.poolId
      ? `${p.poolId.block}:${p.poolId.tx}`
      : `${p.token0.block}:${p.token0.tx}`;

    const token0Id = `${p.token0.block}:${p.token0.tx}`;
    const token1Id = `${p.token1.block}:${p.token1.tx}`;

    // Extract symbols from poolName ("DIESEL / bUSD" → ["DIESEL", "bUSD"])
    const nameParts = p.poolName.split('/').map(s => s.trim());
    const token0Symbol = nameParts[0] || getTokenSymbol(token0Id);
    const token1Symbol = nameParts[1] || getTokenSymbol(token1Id);

    if (!poolId || !token0Id || !token1Id) continue;

    items.push({
      id: poolId,
      pairLabel: `${token0Symbol} / ${token1Symbol} LP`,
      token0: {
        id: token0Id,
        symbol: token0Symbol,
        name: token0Symbol,
        iconUrl: getTokenIconUrl(token0Id, network),
      },
      token1: {
        id: token1Id,
        symbol: token1Symbol,
        name: token1Symbol,
        iconUrl: getTokenIconUrl(token1Id, network),
      },
      tvlUsd: toNum(p.poolTvlInUsd),
      token0TvlUsd: toNum(p.token0TvlInUsd),
      token1TvlUsd: toNum(p.token1TvlInUsd),
      vol24hUsd: toNum(p.poolVolume1dInUsd),
      vol7dUsd: toNum(p.poolVolume7dInUsd),
      vol30dUsd: toNum(p.poolVolume30dInUsd),
      apr: toNum(p.poolApr),
    });
  }

  return items;
}

// ============================================================================
// SDK fallback fetch
// ============================================================================

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
  network: string,
  btcPrice: number | undefined,
  busdTokenId: string,
): Promise<PoolsListItem[]> {
  let rawPools: any[] = [];

  // Method 1: dataApiGetPools
  try {
    const dataApiResult = await provider.dataApiGetPools(factoryId);
    rawPools = extractPoolsArray(dataApiResult);
    console.log('[usePools] SDK dataApiGetPools returned', rawPools.length, 'pools');
  } catch (e) {
    console.warn('[usePools] SDK dataApiGetPools failed:', e);
  }

  // Method 2: alkanesGetAllPoolsWithDetails
  if (rawPools.length === 0) {
    try {
      const rpcResult = await provider.alkanesGetAllPoolsWithDetails(factoryId);
      const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
      const rpcPools = parsed?.pools || [];

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
      console.log('[usePools] SDK RPC returned', rawPools.length, 'pools');
    } catch (e) {
      console.warn('[usePools] SDK RPC failed:', e);
    }
  }

  if (rawPools.length === 0) return [];

  const items: PoolsListItem[] = [];

  for (const p of rawPools) {
    const poolId = p.pool_id || `${p.pool_block_id}:${p.pool_tx_id}`;
    const token0Id = p.token0_id || (p.token0_block_id != null && p.token0_tx_id != null
      ? `${p.token0_block_id}:${p.token0_tx_id}` : '');
    const token1Id = p.token1_id || (p.token1_block_id != null && p.token1_tx_id != null
      ? `${p.token1_block_id}:${p.token1_tx_id}` : '');

    let token0Name = getTokenSymbol(token0Id, p.token0_name);
    let token1Name = getTokenSymbol(token1Id, p.token1_name);

    if ((!token0Name || token0Name === 'UNK' || !token1Name || token1Name === 'UNK') && p.pool_name) {
      const match = p.pool_name.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        if (!token0Name || token0Name === 'UNK') token0Name = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        if (!token1Name || token1Name === 'UNK') token1Name = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    if (!poolId || !token0Id || !token1Id || !token0Name || !token1Name) continue;

    let tvlUsd = 0;
    let token0TvlUsd = 0;
    let token1TvlUsd = 0;

    const reserve0 = p.token0_amount || p.reserve_a || '0';
    const reserve1 = p.token1_amount || p.reserve_b || '0';

    if (btcPrice && (reserve0 !== '0' || reserve1 !== '0')) {
      const calculated = calculateTvlFromReserves(token0Id, token1Id, reserve0, reserve1, btcPrice, busdTokenId);
      tvlUsd = calculated.tvlUsd;
      token0TvlUsd = calculated.token0TvlUsd;
      token1TvlUsd = calculated.token1TvlUsd;
    }

    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Name, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Name, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd,
      token0TvlUsd,
      token1TvlUsd,
      vol24hUsd: 0,
      vol7dUsd: 0,
      vol30dUsd: 0,
      apr: 0,
    });
  }

  return items;
}

// ============================================================================
// Hook
// ============================================================================

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID, BUSD_ALKANE_ID, OYL_ALKANODE_URL } = getConfig(network);
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
      btcPrice ?? 0,
    ],
    staleTime: 120_000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    enabled: !!network && !!ALKANE_FACTORY_ID,
    queryFn: async () => {
      console.log('[usePools] Fetching pools for factory:', ALKANE_FACTORY_ID);

      let items: PoolsListItem[] = [];

      // Primary: OYL Alkanode API (returns all pools with TVL/volume/APR)
      try {
        console.log('[usePools] Trying OYL Alkanode...');
        items = await fetchPoolsFromAlkanode(OYL_ALKANODE_URL, ALKANE_FACTORY_ID, network);
        console.log('[usePools] OYL Alkanode returned', items.length, 'pools');
      } catch (e) {
        console.warn('[usePools] OYL Alkanode failed:', e);
      }

      // Fallback: ts-sdk
      if (items.length === 0 && provider) {
        console.log('[usePools] Falling back to ts-sdk...');
        items = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID, network, btcPrice, BUSD_ALKANE_ID);
        console.log('[usePools] SDK returned', items.length, 'pools');
      }

      if (items.length === 0) {
        throw new Error('Failed to fetch pools from any source');
      }

      return applyFiltersAndPagination(items, params);
    },
  });
}

// ============================================================================
// Filtering / Sorting / Pagination
// ============================================================================

function applyFiltersAndPagination(
  items: PoolsListItem[],
  params: UsePoolsParams
): { items: PoolsListItem[]; total: number } {
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

  const start = params.offset ?? 0;
  const end = start + (params.limit ?? 200);
  const paginated = sorted.slice(start, end);

  return { items: paginated, total: sorted.length };
}
