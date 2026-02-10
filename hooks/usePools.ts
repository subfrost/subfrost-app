/**
 * usePools - Fetch pool data from Subfrost Data API via @alkanes/ts-sdk
 *
 * Primary: provider.dataApiGetAllPoolsDetails (single HTTP call, returns TVL/volume/APR)
 * Fallback: provider.alkanesGetAllPoolsWithDetails (N+1 RPC sims, no TVL/volume)
 */
import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { queryKeys } from '@/queries/keys';
import { fetchAlkaneNamesBatch } from '@/queries/market';

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
  token0Amount?: string; // Raw reserve amount (sub-units)
  token1Amount?: string; // Raw reserve amount (sub-units)
  lpTotalSupply?: string; // Total LP token supply (sub-units)
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build icon URL for a token
 */
function getTokenIconUrl(tokenId: string, _network: string): string {
  const [block, tx] = tokenId.split(':');
  if (block && tx) {
    return `https://cdn.subfrost.io/alkanes/${block}_${tx}`;
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
 * Get token display name from known tokens (falls back to symbol)
 * Used for pair labels in markets grid (e.g., "METHANE" instead of "CH4")
 */
function getTokenName(tokenId: string, rawName?: string): string {
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.name;

  if (rawName) {
    return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  }

  return getTokenSymbol(tokenId, rawName);
}

/**
 * Enrich pool items with dynamically fetched token names for any tokens
 * not in the hardcoded KNOWN_TOKENS map.
 * Uses Espo batch RPC (essentials.get_alkane_info) — one call for all tokens.
 */
async function enrichTokenNames(items: PoolsListItem[], network: string): Promise<void> {
  const unknownIds = new Set<string>();
  for (const item of items) {
    if (!KNOWN_TOKENS[item.token0.id]) unknownIds.add(item.token0.id);
    if (!KNOWN_TOKENS[item.token1.id]) unknownIds.add(item.token1.id);
  }

  if (unknownIds.size === 0) return;

  console.log('[usePools] Batch-fetching names for', unknownIds.size, 'unknown tokens');
  const nameMap = await fetchAlkaneNamesBatch(Array.from(unknownIds), network);

  if (Object.keys(nameMap).length === 0) return;

  for (const item of items) {
    const t0Info = nameMap[item.token0.id];
    const t1Info = nameMap[item.token1.id];

    if (t0Info) {
      if (t0Info.name) item.token0.name = t0Info.name;
      if (t0Info.symbol) item.token0.symbol = t0Info.symbol;
    }
    if (t1Info) {
      if (t1Info.name) item.token1.name = t1Info.name;
      if (t1Info.symbol) item.token1.symbol = t1Info.symbol;
    }

    const name0 = item.token0.name || item.token0.symbol;
    const name1 = item.token1.name || item.token1.symbol;
    item.pairLabel = `${name0} / ${name1} LP`;
  }

  console.log('[usePools] Enriched token names:', Object.keys(nameMap).length, 'tokens');
}

// ============================================================================
// Data API pool fetch (primary — single call via dataApiGetAllPoolsDetails)
// ============================================================================

async function fetchPoolsFromDataApi(
  provider: any,
  factoryId: string,
  network: string,
): Promise<PoolsListItem[]> {
  const result = await Promise.race([
    provider.dataApiGetAllPoolsDetails(factoryId),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dataApiGetAllPoolsDetails timeout (30s)')), 30000)),
  ]);
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  // SDK may return raw API response wrapped in { data: ... } or already unwrapped
  const pools = parsed?.pools || parsed?.data?.pools || [];

  console.log('[usePools] dataApiGetAllPoolsDetails returned', pools.length, 'pools');

  const items: PoolsListItem[] = [];

  for (const p of pools) {
    const poolId = p.poolId
      ? `${p.poolId.block}:${p.poolId.tx}`
      : '';
    const token0Id = p.token0
      ? `${p.token0.block}:${p.token0.tx}`
      : '';
    const token1Id = p.token1
      ? `${p.token1.block}:${p.token1.tx}`
      : '';

    if (!poolId || !token0Id || !token1Id) continue;

    // Extract token names from pool name (e.g., "DIESEL / frBTC LP")
    let token0NameFromPool = '';
    let token1NameFromPool = '';
    if (p.poolName) {
      const match = p.poolName.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        token0NameFromPool = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1NameFromPool = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const token0Symbol = getTokenSymbol(token0Id, token0NameFromPool);
    const token1Symbol = getTokenSymbol(token1Id, token1NameFromPool);

    if (!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') continue;

    const token0Name = getTokenName(token0Id, token0NameFromPool);
    const token1Name = getTokenName(token1Id, token1NameFromPool);

    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd: p.poolTvlInUsd ?? 0,
      token0TvlUsd: p.token0TvlInUsd ?? 0,
      token1TvlUsd: p.token1TvlInUsd ?? 0,
      vol24hUsd: p.poolVolume1dInUsd ?? 0,
      vol7dUsd: p.poolVolume7dInUsd ?? 0,
      vol30dUsd: p.poolVolume30dInUsd ?? 0,
      apr: p.poolApr ?? 0,
      token0Amount: p.token0Amount || '0',
      token1Amount: p.token1Amount || '0',
      lpTotalSupply: p.tokenSupply || undefined,
    });
  }

  return items;
}

// ============================================================================
// SDK RPC fallback (N+1 calls via alkanesGetAllPoolsWithDetails)
// ============================================================================

async function fetchPoolsFromSDKFallback(
  provider: any,
  factoryId: string,
  network: string,
): Promise<PoolsListItem[]> {
  const rpcResult = await Promise.race([
    provider.alkanesGetAllPoolsWithDetails(factoryId),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('alkanesGetAllPoolsWithDetails timeout (30s)')), 30000)),
  ]);
  const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
  const rpcPools = parsed?.pools || [];

  console.log('[usePools] SDK fallback returned', rpcPools.length, 'pools');

  const items: PoolsListItem[] = [];

  for (const p of rpcPools) {
    const poolId = `${p.pool_id_block}:${p.pool_id_tx}`;
    const d = p.details || {};
    const token0Id = d.token_a_block != null && d.token_a_tx != null
      ? `${d.token_a_block}:${d.token_a_tx}` : '';
    const token1Id = d.token_b_block != null && d.token_b_tx != null
      ? `${d.token_b_block}:${d.token_b_tx}` : '';

    let token0Symbol = getTokenSymbol(token0Id, d.token_a_name);
    let token1Symbol = getTokenSymbol(token1Id, d.token_b_name);

    if ((!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') && d.pool_name) {
      const match = d.pool_name.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        if (!token0Symbol || token0Symbol === 'UNK') token0Symbol = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        if (!token1Symbol || token1Symbol === 'UNK') token1Symbol = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    if (!poolId || !token0Id || !token1Id || !token0Symbol || !token1Symbol) continue;

    const token0Name = getTokenName(token0Id, d.token_a_name);
    const token1Name = getTokenName(token1Id, d.token_b_name);

    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd: 0,
      token0TvlUsd: 0,
      token1TvlUsd: 0,
      vol24hUsd: 0,
      vol7dUsd: 0,
      vol30dUsd: 0,
      apr: 0,
      token0Amount: d.reserve_a || '0',
      token1Amount: d.reserve_b || '0',
    });
  }

  return items;
}

// ============================================================================
// Hook
// ============================================================================

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID } = getConfig(network);
  const { provider } = useAlkanesSDK();

  const paramsKey = `${params.search ?? ''}|${params.limit ?? 100}|${params.offset ?? 0}|${params.sortBy ?? 'tvl'}|${params.order ?? 'desc'}`;

  return useQuery<{ items: PoolsListItem[]; total: number }>({
    queryKey: queryKeys.pools.list(network, paramsKey),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    enabled: !!network && !!ALKANE_FACTORY_ID && !!provider,
    queryFn: async () => {
      console.log('[usePools] Fetching pools for factory:', ALKANE_FACTORY_ID);

      if (!provider) {
        throw new Error('SDK provider not available');
      }

      let items: PoolsListItem[] = [];

      // Primary: Data API (single call with pre-calculated TVL/volume/APR)
      try {
        items = await fetchPoolsFromDataApi(provider, ALKANE_FACTORY_ID, network);
      } catch (e) {
        console.warn('[usePools] dataApiGetAllPoolsDetails failed, falling back to SDK:', e);
      }

      // Fallback: N+1 RPC simulation calls (no TVL/volume data)
      if (items.length === 0) {
        try {
          items = await fetchPoolsFromSDKFallback(provider, ALKANE_FACTORY_ID, network);
        } catch (e) {
          console.warn('[usePools] SDK fallback also failed:', e);
        }
      }

      if (items.length === 0) {
        throw new Error('Failed to fetch pools from any source');
      }

      // Enrich tokens not in KNOWN_TOKENS via Espo batch RPC (single call)
      await enrichTokenNames(items, network);

      // Remove known scam/impersonator pools
      const beforeCount = items.length;
      items = items.filter(p => !isBlacklistedPool(p));
      if (items.length < beforeCount) {
        console.log(`[usePools] Filtered out ${beforeCount - items.length} blacklisted pool(s)`);
      }

      // Remove dust/dead pools with negligible TVL (skip on regtest where pricing is unavailable)
      if (!network?.includes('regtest')) {
        const MIN_TVL_USD = 5;
        items = items.filter(p => (p.tvlUsd ?? 0) >= MIN_TVL_USD);
      }

      return applyFiltersAndPagination(items, params);
    },
  });
}

// ============================================================================
// Scam pool blacklist
// ============================================================================

// Blacklisted pool IDs: known scam pools that impersonate legitimate tokens.
const BLACKLISTED_POOL_IDS = new Set([
  '2:25473',  // fake METHANE pool
  '2:25512',  // fake DIESEL pool
  '2:70054',  // bUSD / frBTC (scam duplicate; legit is 2:77222)
  '2:70060',  // scam pool
  '2:70100',  // btc / bUSD (fake btc token)
  '2:77260',  // btc / frBTC (fake btc token)
]);

// Blacklisted token IDs: scam tokens impersonating BTC or bUSD.
// Real BTC in pools is frBTC (32:0). Real bUSD is 2:56801.
const BLACKLISTED_TOKEN_IDS = new Set([
  '2:119',    // fake USD
  '2:120',    // fake BTC
  '2:135',    // fake METHANE
  '2:148',    // fake USD
  '2:150',    // fake USD
  '2:153',    // fake ETH
  '2:154',    // fake BTC
  '2:164',    // fake USD
  '2:166',    // fake USD
  '2:177',    // fake USD
  '2:182',    // fake USD
  '2:185',    // fake BTC
  '2:192',    // fake SOL
  '2:220',    // fake USD
  '2:235',    // fake BTC
  '2:236',    // fake ETH
  '2:238',    // fake ETH
  '2:405',    // fake METHANE
  '2:406',    // fake DIESEL
  '2:493',    // fake ETH
  '2:21681',  // fake BTC
  '2:21700',  // fake BTC
  '2:25982',  // fake USD
  '2:30971',  // fake USD
  '2:50006',  // fake METHANE
  '2:50119',  // fake METHANE
  '2:62279',  // fake USD
  '2:68427',  // fake USD
  '2:70798',  // fake USD
  '2:77434',  // fake METHANE
]);

/**
 * Returns true if the pool should be hidden.
 * Criteria:
 *  1. Pool ID is explicitly blacklisted.
 *  2. Pool contains a blacklisted scam token ID.
 *  3. Pool contains a token with symbol "btc" (case-insensitive) — real BTC
 *     is represented as frBTC (32:0) inside AMM pools.
 */
function isBlacklistedPool(pool: PoolsListItem): boolean {
  if (BLACKLISTED_POOL_IDS.has(pool.id)) return true;

  if (BLACKLISTED_TOKEN_IDS.has(pool.token0.id) || BLACKLISTED_TOKEN_IDS.has(pool.token1.id)) {
    return true;
  }

  // Any pool whose token symbol is exactly "btc" (case-insensitive) is a
  // scam impersonating native BTC.
  if (pool.token0.symbol.toLowerCase() === 'btc' || pool.token1.symbol.toLowerCase() === 'btc') {
    return true;
  }

  return false;
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
        p.token1.symbol.toLowerCase().includes(searchLower) ||
        (p.token0.name?.toLowerCase().includes(searchLower)) ||
        (p.token1.name?.toLowerCase().includes(searchLower))
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
