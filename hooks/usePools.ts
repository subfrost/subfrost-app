/**
 * usePools - Fetch pool data from Subfrost API via @alkanes/ts-sdk
 *
 * All pool data comes from the SDK's dataApiGetPools / alkanesGetAllPoolsWithDetails
 * which route through subfrost endpoints. No external services (alkanode/Espo) are used.
 */
import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { queryKeys } from '@/queries/keys';

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

// Token IDs for TVL calculation (used by SDK fallback)
const FRBTC_TOKEN_ID = '32:0';

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
 * Fetch token names for unknown tokens via SDK's alkanesReflect.
 * Returns a map of tokenId → { name, symbol }.
 */
async function fetchUnknownTokenNames(
  tokenIds: string[],
  provider: any
): Promise<Record<string, { name: string; symbol: string }>> {
  if (tokenIds.length === 0 || !provider) return {};

  const map: Record<string, { name: string; symbol: string }> = {};

  // Fetch in parallel with individual timeouts
  await Promise.all(
    tokenIds.map(async (tokenId) => {
      try {
        const reflection = await Promise.race([
          provider.alkanesReflect(tokenId),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        const parsed = typeof reflection === 'string' ? JSON.parse(reflection) : reflection;
        const name = (parsed?.name || '').replace('SUBFROST BTC', 'frBTC').trim();
        const symbol = (parsed?.symbol || '').trim();
        if (name || symbol) {
          map[tokenId] = { name, symbol };
        }
      } catch {
        // Skip tokens that fail — name will fall back to pool_name parsing
      }
    })
  );

  return map;
}

/**
 * Enrich pool items with dynamically fetched token names for any tokens
 * not in the hardcoded KNOWN_TOKENS map.
 */
async function enrichTokenNames(items: PoolsListItem[], provider: any): Promise<void> {
  // Collect unknown token IDs
  const unknownIds = new Set<string>();
  for (const item of items) {
    if (!KNOWN_TOKENS[item.token0.id]) unknownIds.add(item.token0.id);
    if (!KNOWN_TOKENS[item.token1.id]) unknownIds.add(item.token1.id);
  }

  if (unknownIds.size === 0) return;

  console.log('[usePools] Fetching names for', unknownIds.size, 'unknown tokens:', Array.from(unknownIds));
  const nameMap = await fetchUnknownTokenNames(Array.from(unknownIds), provider);

  if (Object.keys(nameMap).length === 0) return;

  // Apply fetched names to pool items
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

    // Rebuild pairLabel using names
    const name0 = item.token0.name || item.token0.symbol;
    const name1 = item.token1.name || item.token1.symbol;
    item.pairLabel = `${name0} / ${name1} LP`;
  }

  console.log('[usePools] Enriched token names:', Object.keys(nameMap).length, 'tokens');
}

// ============================================================================
// SDK pool fetch (primary and only data source — alkanesGetAllPoolsWithDetails)
// ============================================================================

async function fetchPoolsFromSDK(
  provider: any,
  factoryId: string,
  network: string,
  btcPrice: number | undefined,
  busdTokenId: string,
): Promise<PoolsListItem[]> {
  let rawPools: any[] = [];

  // alkanesGetAllPoolsWithDetails: alkanes_simulate RPC calls through /api/rpc proxy.
  // Makes N+1 calls (1 factory opcode 3 + N pool opcode 999). 30s timeout for mainnet.
  // This is the only reliable method — dataApiGetPools calls subfrost /get-pools which
  // returns bare pool IDs without token/reserve data, then tries unsupported endpoints.
  try {
    const rpcResult = await Promise.race([
      provider.alkanesGetAllPoolsWithDetails(factoryId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('alkanesGetAllPoolsWithDetails timeout (30s)')), 30000)),
    ]);
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
    console.log('[usePools] alkanesGetAllPoolsWithDetails returned', rawPools.length, 'pools');
  } catch (e) {
    console.warn('[usePools] alkanesGetAllPoolsWithDetails failed:', e);
  }

  if (rawPools.length === 0) return [];

  const items: PoolsListItem[] = [];

  for (const p of rawPools) {
    const poolId = p.pool_id || `${p.pool_block_id}:${p.pool_tx_id}`;
    const token0Id = p.token0_id || (p.token0_block_id != null && p.token0_tx_id != null
      ? `${p.token0_block_id}:${p.token0_tx_id}` : '');
    const token1Id = p.token1_id || (p.token1_block_id != null && p.token1_tx_id != null
      ? `${p.token1_block_id}:${p.token1_tx_id}` : '');

    let token0Symbol = getTokenSymbol(token0Id, p.token0_name);
    let token1Symbol = getTokenSymbol(token1Id, p.token1_name);

    if ((!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') && p.pool_name) {
      const match = p.pool_name.match(/^(.+?)\s*\/\s*(.+?)\s*LP$/);
      if (match) {
        if (!token0Symbol || token0Symbol === 'UNK') token0Symbol = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        if (!token1Symbol || token1Symbol === 'UNK') token1Symbol = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    if (!poolId || !token0Id || !token1Id || !token0Symbol || !token1Symbol) continue;

    const token0Name = getTokenName(token0Id, p.token0_name);
    const token1Name = getTokenName(token1Id, p.token1_name);

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
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd,
      token0TvlUsd,
      token1TvlUsd,
      vol24hUsd: 0,
      vol7dUsd: 0,
      vol30dUsd: 0,
      apr: 0,
      token0Amount: reserve0,
      token1Amount: reserve1,
    });
  }

  return items;
}

// ============================================================================
// Hook
// ============================================================================

export function usePools(params: UsePoolsParams = {}) {
  const { network } = useWallet();
  const { ALKANE_FACTORY_ID, BUSD_ALKANE_ID } = getConfig(network);
  const { data: btcPrice } = useBtcPrice();
  const { provider } = useAlkanesSDK();

  const paramsKey = `${params.search ?? ''}|${params.limit ?? 100}|${params.offset ?? 0}|${params.sortBy ?? 'tvl'}|${params.order ?? 'desc'}`;

  return useQuery<{ items: PoolsListItem[]; total: number }>({
    queryKey: queryKeys.pools.list(network, paramsKey, btcPrice ?? 0),
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    enabled: !!network && !!ALKANE_FACTORY_ID && !!provider,
    queryFn: async () => {
      console.log('[usePools] Fetching pools for factory:', ALKANE_FACTORY_ID);

      if (!provider) {
        throw new Error('SDK provider not available');
      }

      let items = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID, network, btcPrice, BUSD_ALKANE_ID);
      console.log('[usePools] SDK returned', items.length, 'pools');

      if (items.length === 0) {
        throw new Error('Failed to fetch pools from SDK');
      }

      // Enrich tokens not in KNOWN_TOKENS with names from SDK
      await enrichTokenNames(items, provider);

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
