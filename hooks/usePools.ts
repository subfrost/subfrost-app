/**
 * usePools - Fetch pool data from Subfrost API via @alkanes/ts-sdk
 *
 * Primary: Espo ammdata.get_pools (mainnet)
 * Secondary: ts-sdk dataApi.getPools
 * Fallback: RPC simulation for regtest
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
// Espo ammdata.get_pools (primary for mainnet)
// ============================================================================

const ESPO_RPC_URL = process.env.NEXT_PUBLIC_ESPO_RPC_URL || 'https://api.alkanode.com/rpc';

async function fetchPoolsFromEspo(
  network: string,
  btcPrice: number | undefined,
  busdTokenId: string,
): Promise<PoolsListItem[]> {
  const response = await fetch(ESPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'ammdata.get_pools',
      params: {},
      id: 1,
    }),
  });

  if (!response.ok) throw new Error(`Espo HTTP error: ${response.status}`);
  const json = await response.json();
  const result = json.result;
  if (!result?.ok || !result.pools) throw new Error(result?.error || 'espo returned no pools');

  const items: PoolsListItem[] = [];
  for (const [poolId, pool] of Object.entries(result.pools) as [string, any][]) {
    const baseId = pool.base;
    const quoteId = pool.quote;
    if (!baseId || !quoteId) continue;

    const token0Symbol = getTokenSymbol(baseId);
    const token1Symbol = getTokenSymbol(quoteId);

    const tvlCalc = calculateTvlFromReserves(baseId, quoteId, pool.base_reserve || '0', pool.quote_reserve || '0', btcPrice, busdTokenId);

    items.push({
      id: poolId,
      pairLabel: `${token0Symbol} / ${token1Symbol} LP`,
      token0: { id: baseId, symbol: token0Symbol, name: token0Symbol, iconUrl: getTokenIconUrl(baseId, network) },
      token1: { id: quoteId, symbol: token1Symbol, name: token1Symbol, iconUrl: getTokenIconUrl(quoteId, network) },
      tvlUsd: tvlCalc.tvlUsd,
      token0TvlUsd: tvlCalc.token0TvlUsd,
      token1TvlUsd: tvlCalc.token1TvlUsd,
      vol24hUsd: 0,
      vol7dUsd: 0,
      vol30dUsd: 0,
      apr: 0,
      token0Amount: pool.base_reserve || '0',
      token1Amount: pool.quote_reserve || '0',
    });
  }

  return items;
}

// ============================================================================
// Direct RPC simulation fallback (regtest — factory opcode 3 + pool opcode 999)
// ============================================================================

function readU128LE(hex: string, byteOffset: number): bigint {
  const start = byteOffset * 2;
  const bytes = hex.slice(start, start + 32);
  if (bytes.length < 32) return 0n;
  let val = 0n;
  for (let i = 0; i < 16; i++) {
    const byte = parseInt(bytes.slice(i * 2, i * 2 + 2), 16);
    val += BigInt(byte) << BigInt(i * 8);
  }
  return val;
}

async function fetchPoolsViaRpcSimulation(
  factoryId: string,
  network: string,
  btcPrice: number | undefined,
  busdTokenId: string,
): Promise<PoolsListItem[]> {
  const rpcUrl = typeof window !== 'undefined' ? '/api/rpc' : (
    process.env.REGTEST_RPC_URL || 'https://regtest.subfrost.io/v4/subfrost'
  );

  // Step 1: Get all pool IDs from factory (opcode 3)
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_simulate',
      params: [{
        target: factoryId,
        inputs: ['3'],
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '999999',
        txindex: 0,
        vout: 0,
      }],
      id: 1,
    }),
  });

  if (!resp.ok) throw new Error(`RPC error: ${resp.status}`);
  const json = await resp.json();
  const exec = json.result?.execution;
  if (exec?.error || !exec?.data) throw new Error(exec?.error || 'no data');

  const data = exec.data.startsWith('0x') ? exec.data.slice(2) : exec.data;
  if (data.length < 32) return [];

  const poolCount = Number(readU128LE(data, 0));
  const poolIds: { block: string; tx: string }[] = [];
  for (let i = 0; i < poolCount; i++) {
    poolIds.push({
      block: readU128LE(data, 16 + i * 32).toString(),
      tx: readU128LE(data, 16 + i * 32 + 16).toString(),
    });
  }

  if (poolIds.length === 0) return [];

  // Step 2: Query pool details (opcode 999) individually
  // NOTE: Individual requests instead of batch because /api/rpc proxy routes
  // batch arrays to /v4/jsonrpc which may not support alkanes_simulate.
  const items: PoolsListItem[] = [];
  for (let i = 0; i < poolIds.length; i++) {
    const pool = poolIds[i];

    try {
      const detailResp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{
            target: `${pool.block}:${pool.tx}`,
            inputs: ['999'],
            alkanes: [],
            transaction: '0x',
            block: '0x',
            height: '999999',
            txindex: 0,
            vout: 0,
          }],
          id: 1,
        }),
      });

      if (!detailResp.ok) continue;
      const detailJson = await detailResp.json();
      const result = detailJson.result?.execution;
      if (!result?.data || result.error) continue;

      const d = result.data.startsWith('0x') ? result.data.slice(2) : result.data;
      if (d.length < 192) continue;

      const token0Id = `${readU128LE(d, 0)}:${readU128LE(d, 16)}`;
      const token1Id = `${readU128LE(d, 32)}:${readU128LE(d, 48)}`;
      const reserve0 = readU128LE(d, 64).toString();
      const reserve1 = readU128LE(d, 80).toString();
      const totalSupply = d.length >= 224 ? readU128LE(d, 96).toString() : '0';

      const token0Symbol = getTokenSymbol(token0Id);
      const token1Symbol = getTokenSymbol(token1Id);
      const tvlCalc = calculateTvlFromReserves(token0Id, token1Id, reserve0, reserve1, btcPrice, busdTokenId);

      items.push({
        id: `${pool.block}:${pool.tx}`,
        pairLabel: `${token0Symbol} / ${token1Symbol} LP`,
        token0: { id: token0Id, symbol: token0Symbol, name: token0Symbol, iconUrl: getTokenIconUrl(token0Id, network) },
        token1: { id: token1Id, symbol: token1Symbol, name: token1Symbol, iconUrl: getTokenIconUrl(token1Id, network) },
        tvlUsd: tvlCalc.tvlUsd,
        token0TvlUsd: tvlCalc.token0TvlUsd,
        token1TvlUsd: tvlCalc.token1TvlUsd,
        vol24hUsd: 0,
        vol7dUsd: 0,
        vol30dUsd: 0,
        apr: 0,
        token0Amount: reserve0,
        token1Amount: reserve1,
        lpTotalSupply: totalSupply,
      });
    } catch (e) {
      console.warn(`[fetchPoolsViaRpc] Failed to fetch details for pool ${pool.block}:${pool.tx}:`, e);
    }
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
    enabled: !!network && !!ALKANE_FACTORY_ID,
    queryFn: async () => {
      console.log('[usePools] Fetching pools for factory:', ALKANE_FACTORY_ID);

      let items: PoolsListItem[] = [];
      const isRegtest = network === 'regtest' || network === 'subfrost-regtest' || network === 'regtest-local';

      // Priority 1: Espo ammdata.get_pools (mainnet only — Espo returns mainnet data,
      // so using it on regtest would give wrong pool reserves for matching token IDs like 2:0/32:0)
      if (!isRegtest) {
        try {
          items = await fetchPoolsFromEspo(network, btcPrice, BUSD_ALKANE_ID);
          console.log('[usePools] Espo returned', items.length, 'pools');
        } catch (e) {
          console.warn('[usePools] Espo failed:', e);
        }
      }

      // Priority 2: ts-sdk dataApi.getPools
      if (items.length === 0 && provider) {
        try {
          items = await fetchPoolsFromSDK(provider, ALKANE_FACTORY_ID, network, btcPrice, BUSD_ALKANE_ID);
          console.log('[usePools] SDK dataApi returned', items.length, 'pools');
        } catch (e) {
          console.warn('[usePools] SDK dataApi failed:', e);
        }
      }

      // Priority 3: Direct RPC simulation (regtest/universal fallback)
      if (items.length === 0) {
        try {
          items = await fetchPoolsViaRpcSimulation(ALKANE_FACTORY_ID, network, btcPrice, BUSD_ALKANE_ID);
          console.log('[usePools] RPC simulation returned', items.length, 'pools');
        } catch (e) {
          console.warn('[usePools] RPC simulation failed:', e);
        }
      }

      if (items.length === 0) {
        throw new Error('Failed to fetch pools from any source');
      }

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
