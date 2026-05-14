/**
 * usePools - Fetch pool data from Subfrost Data API via @alkanes/ts-sdk
 *
 * Primary: provider.dataApiGetAllPoolsDetails (single HTTP call, returns TVL/volume/APR)
 * Fallback: provider.alkanesGetAllPoolsWithDetails (N+1 RPC sims, no TVL/volume)
 */
import { useQuery } from '@tanstack/react-query';

import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { simulateContract, extractField3Data, parseU128LE } from '@/lib/fujin/rpc';
import { getCuratedPoolsListItems } from '@/lib/alkanes/curated-pools';
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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Standard AMM swap fee (0.3%)
 * Used for APR calculation when backend doesn't provide poolApr.
 */
const DEFAULT_SWAP_FEE_RATE = 0.003;

/**
 * Calculate APR from 24h volume and TVL.
 * Formula: (vol24h × feeRate × 365 / tvl) × 100
 *
 * Returns 0 if TVL is too small to avoid division by zero or absurd values.
 */
function calculateApr(vol24hUsd: number, tvlUsd: number, feeRate: number = DEFAULT_SWAP_FEE_RATE): number {
  // Require minimum $5 TVL (matches MIN_TVL_USD display filter) to avoid division by near-zero
  if (!tvlUsd || tvlUsd < 5) return 0;
  if (!vol24hUsd || vol24hUsd <= 0) return 0;

  const dailyFees = vol24hUsd * feeRate;
  const annualizedFees = dailyFees * 365;
  const apr = (annualizedFees / tvlUsd) * 100;

  // Cap at 10000% APR to filter out noise from low-liquidity pools
  return Math.min(apr, 10000);
}

/**
 * Build icon URL for a token
 */
export function getTokenIconUrl(tokenId: string, _network: string): string {
  const [block, tx] = tokenId.split(':');
  if (block && tx) {
    return `https://cdn.subfrost.io/alkanes/${block}_${tx}`;
  }
  return '';
}

/**
 * Get token symbol from known tokens or extract from name
 */
const numericOnlyPattern = /^\d+$/;

function getTokenSymbol(tokenId: string, rawName?: string, tokenMetaMap?: Map<string, { name: string; symbol: string }>): string {
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.symbol;

  // Check espo-backed token metadata (proper names from data API)
  // Skip numeric-only values — prefer rawName (from poolName) which is authoritative
  const meta = tokenMetaMap?.get(tokenId);
  if (meta?.symbol && !numericOnlyPattern.test(meta.symbol)) return meta.symbol;
  if (meta?.name && !numericOnlyPattern.test(meta.name)) return meta.name;

  // rawName is extracted from the pool's poolName field (e.g., "ALKAMIST / frBTC LP" → "ALKAMIST")
  if (rawName) {
    return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  }

  // Accept numeric meta values only as last resort before ID fallback
  if (meta?.symbol) return meta.symbol;
  if (meta?.name) return meta.name;

  return tokenId.split(':')[1] || 'UNK';
}

/**
 * Get token display name from known tokens (falls back to symbol)
 * Used for pair labels in markets grid (e.g., "METHANE" instead of "CH4")
 */
function getTokenName(tokenId: string, rawName?: string, tokenMetaMap?: Map<string, { name: string; symbol: string }>): string {
  const known = KNOWN_TOKENS[tokenId];
  if (known) return known.name;

  // Check espo-backed token metadata (proper names from data API)
  // Skip numeric-only values — prefer rawName (from poolName) which is authoritative
  const meta = tokenMetaMap?.get(tokenId);
  if (meta?.name && !numericOnlyPattern.test(meta.name)) return meta.name;
  if (meta?.symbol && !numericOnlyPattern.test(meta.symbol)) return meta.symbol;

  // rawName is extracted from the pool's poolName field
  if (rawName) {
    return rawName.replace('SUBFROST BTC', 'frBTC').trim();
  }

  // Accept numeric meta values only as last resort
  if (meta?.name) return meta.name;
  if (meta?.symbol) return meta.symbol;

  return getTokenSymbol(tokenId, rawName, tokenMetaMap);
}

/**
 * Fetch token metadata via the /api/token-names proxy (avoids CORS).
 * The proxy calls /get-alkanes on the server and returns { names: { alkaneId: { name, symbol } } }.
 */
async function fetchTokenMetadata(network: string): Promise<Map<string, { name: string; symbol: string }>> {
  try {
    const resp = await fetch(`/api/token-names?network=${encodeURIComponent(network)}&limit=500`);
    if (!resp.ok) return new Map();
    const data = await resp.json();
    const names: Record<string, { name: string; symbol: string }> = data?.names || {};
    const map = new Map<string, { name: string; symbol: string }>();
    for (const [alkaneId, entry] of Object.entries(names)) {
      map.set(alkaneId, entry as { name: string; symbol: string });
    }
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Fetch individual token metadata for tokens missing from the bulk set.
 * Uses /api/token-details proxy to avoid CORS issues.
 */
async function fetchMissingTokenMetadata(
  missingIds: string[],
  network: string,
  metaMap: Map<string, { name: string; symbol: string }>,
): Promise<void> {
  if (missingIds.length === 0) return;
  try {
    const resp = await fetch('/api/token-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alkaneIds: missingIds, network }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const names: Record<string, { name: string; symbol: string }> = data?.names || {};
    for (const [alkaneId, entry] of Object.entries(names)) {
      metaMap.set(alkaneId, entry as { name: string; symbol: string });
    }
  } catch { /* ignore failures */ }
}

// ============================================================================
// Data API pool fetch (primary — single call via dataApiGetAllPoolsDetails)
// ============================================================================

async function fetchPoolsFromDataApi(
  provider: any,
  factoryId: string,
  network: string,
  tokenMetaMap?: Map<string, { name: string; symbol: string }>,
): Promise<PoolsListItem[]> {
  const result = await Promise.race([
    provider.dataApiGetAllPoolsDetails(factoryId),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dataApiGetAllPoolsDetails timeout (30s)')), 30000)),
  ]);
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  // SDK may return raw API response wrapped in { data: ... } or already unwrapped.
  // On devnet, espo (served from public/wasm/quspo.wasm for compatibility) transform returns { statusCode, data: [pools] } where data is
  // the pool array directly (not data.pools).
  const pools = parsed?.pools
    || parsed?.data?.pools
    || (Array.isArray(parsed?.data) ? parsed.data : []);

  if (pools.length === 0) {
    throw new Error('dataApiGetAllPoolsDetails returned 0 pools (API may be down)');
  }

  const items: PoolsListItem[] = [];

  for (const p of pools) {
    const poolId = p.poolId
      ? `${p.poolId.block}:${p.poolId.tx}`
      : '';
    // Handle both API formats: token0.alkaneId.block (get-all-token-pairs) and token0.block (get-all-pools-details)
    const token0Id = p.token0
      ? `${p.token0.alkaneId?.block ?? p.token0.block}:${p.token0.alkaneId?.tx ?? p.token0.tx}`
      : '';
    const token1Id = p.token1
      ? `${p.token1.alkaneId?.block ?? p.token1.block}:${p.token1.alkaneId?.tx ?? p.token1.tx}`
      : '';

    if (!poolId || !token0Id || !token1Id) continue;

    // Extract token names from pool name (e.g., "DIESEL / bUSD" or "DIESEL / frBTC LP")
    let token0NameFromPool = '';
    let token1NameFromPool = '';
    if (p.poolName) {
      const match = p.poolName.match(/^(.+?)\s*\/\s*(.+?)(?:\s*LP)?$/);
      if (match) {
        token0NameFromPool = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1NameFromPool = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const token0Symbol = getTokenSymbol(token0Id, token0NameFromPool, tokenMetaMap);
    const token1Symbol = getTokenSymbol(token1Id, token1NameFromPool, tokenMetaMap);

    if (!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') continue;

    const token0Name = getTokenName(token0Id, token0NameFromPool, tokenMetaMap);
    const token1Name = getTokenName(token1Id, token1NameFromPool, tokenMetaMap);

    const tvlUsd = p.poolTvlInUsd ?? p.tvl ?? 0;
    const vol24hUsd = p.poolVolume1dInUsd ?? p.volume1d ?? 0;
    // Use backend APR if provided, otherwise calculate from volume/TVL
    const apr = p.poolApr ?? p.apr ?? calculateApr(vol24hUsd, tvlUsd);

    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd,
      token0TvlUsd: p.token0TvlInUsd ?? 0,
      token1TvlUsd: p.token1TvlInUsd ?? 0,
      vol24hUsd,
      vol7dUsd: p.poolVolume7dInUsd ?? p.volume7d ?? 0,
      vol30dUsd: p.poolVolume30dInUsd ?? p.volume30d ?? 0,
      apr,
      token0Amount: p.token0Amount || p.reserve0 || p.token0?.token0Amount || '0',
      token1Amount: p.token1Amount || p.reserve1 || p.token1?.token1Amount || '0',
      lpTotalSupply: p.tokenSupply || undefined,
    });
  }

  return items;
}

// ============================================================================
// Pool details REST fallback (direct fetch to OYL Alkanode, bypasses WASM SDK)
// The SDK WASM's dataApiGetAllPoolsDetails deserializes into a Rust struct that
// drops poolVolume30dInUsd. This direct REST call preserves ALL API fields
// including 30D volume. Falls back here when the SDK primary path fails
// (e.g., mainnet.subfrost.io returns 500 "btc/usd price unavailable").
// ============================================================================

async function fetchPoolsFromPoolsDetailsRest(
  factoryId: string,
  network: string,
  tokenMetaMap?: Map<string, { name: string; symbol: string }>,
): Promise<PoolsListItem[]> {
  const [factoryBlock, factoryTx] = factoryId.split(':');
  // Route through app API proxy — never call external URLs directly from hooks
  // Use server-side cached endpoint (30s TTL) to avoid hitting RPC every page load
  const resp = await Promise.race([
    fetch(`/api/pools/cached?network=${network}`),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('cached pools timeout (10s)')), 10000)),
  ]);
  if (!resp.ok) throw new Error(`cached pools HTTP ${resp.status}`);
  const json = await resp.json();
  const pools: any[] = json?.data?.pools || json?.pools || [];

  if (pools.length === 0) {
    throw new Error('get-all-pools-details REST returned 0 pools');
  }

  const items: PoolsListItem[] = [];

  for (const p of pools) {
    const poolId = p.poolId
      ? `${p.poolId.block}:${p.poolId.tx}`
      : '';
    const token0Id = p.token0
      ? `${p.token0.alkaneId?.block ?? p.token0.block}:${p.token0.alkaneId?.tx ?? p.token0.tx}`
      : '';
    const token1Id = p.token1
      ? `${p.token1.alkaneId?.block ?? p.token1.block}:${p.token1.alkaneId?.tx ?? p.token1.tx}`
      : '';

    if (!poolId || !token0Id || !token1Id) continue;

    let token0NameFromPool = '';
    let token1NameFromPool = '';
    if (p.poolName) {
      const match = p.poolName.match(/^(.+?)\s*\/\s*(.+?)(?:\s*LP)?$/);
      if (match) {
        token0NameFromPool = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1NameFromPool = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const t0Name = token0NameFromPool || p.token0?.name || p.token0?.symbol || '';
    const t1Name = token1NameFromPool || p.token1?.name || p.token1?.symbol || '';

    const token0Symbol = getTokenSymbol(token0Id, t0Name, tokenMetaMap);
    const token1Symbol = getTokenSymbol(token1Id, t1Name, tokenMetaMap);

    if (!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') continue;

    const token0Name = getTokenName(token0Id, t0Name, tokenMetaMap);
    const token1Name = getTokenName(token1Id, t1Name, tokenMetaMap);

    const tvlUsd = p.poolTvlInUsd ?? p.tvl ?? 0;
    const vol24hUsd = p.poolVolume1dInUsd ?? p.volume1d ?? 0;
    const apr = p.poolApr ?? p.apr ?? calculateApr(vol24hUsd, tvlUsd);

    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd,
      token0TvlUsd: p.token0TvlInUsd ?? 0,
      token1TvlUsd: p.token1TvlInUsd ?? 0,
      vol24hUsd,
      vol7dUsd: p.poolVolume7dInUsd ?? p.volume7d ?? 0,
      vol30dUsd: p.poolVolume30dInUsd ?? p.volume30d ?? 0,
      apr,
      token0Amount: p.token0Amount || p.reserve0 || p.token0?.token0Amount || '0',
      token1Amount: p.token1Amount || p.reserve1 || p.token1?.token1Amount || '0',
      lpTotalSupply: p.tokenSupply || undefined,
    });
  }

  return items;
}

// ============================================================================
// Token pairs REST fallback (direct fetch, bypasses WASM SDK deserialization)
// The SDK's dataApiGetAllTokenPairs discards the response during WASM parsing,
// so we call the REST endpoint directly via fetch.
// ============================================================================

async function fetchPoolsFromTokenPairsRest(
  factoryId: string,
  network: string,
  tokenMetaMap?: Map<string, { name: string; symbol: string }>,
): Promise<PoolsListItem[]> {
  const [factoryBlock, factoryTx] = factoryId.split(':');
  const proxyUrl = `${getRpcUrl(network)}/get-all-token-pairs`;
  const resp = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ factoryId: { block: factoryBlock, tx: factoryTx } }),
  });
  if (!resp.ok) throw new Error(`get-all-token-pairs HTTP ${resp.status}`);
  const json = await resp.json();
  const pools: any[] = json?.data?.pools || (Array.isArray(json?.data) ? json.data : null) || json?.pools || [];

  const items: PoolsListItem[] = [];

  for (const p of pools) {
    const poolId = p.poolId
      ? `${p.poolId.block}:${p.poolId.tx}`
      : '';
    const token0Id = p.token0
      ? `${p.token0.alkaneId?.block ?? p.token0.block}:${p.token0.alkaneId?.tx ?? p.token0.tx}`
      : '';
    const token1Id = p.token1
      ? `${p.token1.alkaneId?.block ?? p.token1.block}:${p.token1.alkaneId?.tx ?? p.token1.tx}`
      : '';

    if (!poolId || !token0Id || !token1Id) continue;

    let token0NameFromPool = '';
    let token1NameFromPool = '';
    if (p.poolName) {
      const match = p.poolName.match(/^(.+?)\s*\/\s*(.+?)(?:\s*LP)?$/);
      if (match) {
        token0NameFromPool = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1NameFromPool = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const t0Name = token0NameFromPool || p.token0?.name || p.token0?.symbol || '';
    const t1Name = token1NameFromPool || p.token1?.name || p.token1?.symbol || '';

    const token0Symbol = getTokenSymbol(token0Id, t0Name, tokenMetaMap);
    const token1Symbol = getTokenSymbol(token1Id, t1Name, tokenMetaMap);

    if (!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') continue;

    const token0Name = getTokenName(token0Id, t0Name, tokenMetaMap);
    const token1Name = getTokenName(token1Id, t1Name, tokenMetaMap);

    const tvlUsd = p.poolTvlInUsd ?? p.tvl ?? 0;
    const vol24hUsd = p.poolVolume1dInUsd ?? p.volume1d ?? 0;
    const apr = p.poolApr ?? p.apr ?? calculateApr(vol24hUsd, tvlUsd);

    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd,
      token0TvlUsd: p.token0TvlInUsd ?? 0,
      token1TvlUsd: p.token1TvlInUsd ?? 0,
      vol24hUsd,
      vol7dUsd: p.poolVolume7dInUsd ?? p.volume7d ?? 0,
      vol30dUsd: p.poolVolume30dInUsd ?? p.volume30d ?? 0,
      apr,
      token0Amount: p.token0Amount || p.reserve0 || p.token0?.token0Amount || '0',
      token1Amount: p.token1Amount || p.reserve1 || p.token1?.token1Amount || '0',
      lpTotalSupply: p.tokenSupply || undefined,
    });
  }

  return items;
}

// ============================================================================
// Data API fallback (dataApiGetAllTokenPairs — no TVL/volume but works when poolsDetails fails)
// ============================================================================

async function fetchPoolsFromTokenPairsApi(
  provider: any,
  factoryId: string,
  network: string,
  tokenMetaMap?: Map<string, { name: string; symbol: string }>,
): Promise<PoolsListItem[]> {
  const result = await Promise.race([
    provider.dataApiGetAllTokenPairs(factoryId),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dataApiGetAllTokenPairs timeout (30s)')), 30000)),
  ]);
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  // API returns { data: [...] } with pool objects
  const pools = parsed?.pools || parsed?.data?.pools || (Array.isArray(parsed?.data) ? parsed.data : []) || (Array.isArray(parsed) ? parsed : []);

  if (pools.length === 0) {
    throw new Error('dataApiGetAllTokenPairs returned 0 pools');
  }

  const items: PoolsListItem[] = [];

  for (const p of pools) {
    const poolId = p.poolId
      ? `${p.poolId.block}:${p.poolId.tx}`
      : '';
    // Handle get-all-token-pairs format: token0.alkaneId.block
    const token0Id = p.token0
      ? `${p.token0.alkaneId?.block ?? p.token0.block}:${p.token0.alkaneId?.tx ?? p.token0.tx}`
      : '';
    const token1Id = p.token1
      ? `${p.token1.alkaneId?.block ?? p.token1.block}:${p.token1.alkaneId?.tx ?? p.token1.tx}`
      : '';

    if (!poolId || !token0Id || !token1Id) continue;

    // Extract token names from pool name
    let token0NameFromPool = '';
    let token1NameFromPool = '';
    if (p.poolName) {
      const match = p.poolName.match(/^(.+?)\s*\/\s*(.+?)(?:\s*LP)?$/);
      if (match) {
        token0NameFromPool = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        token1NameFromPool = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    const token0Symbol = getTokenSymbol(token0Id, token0NameFromPool, tokenMetaMap);
    const token1Symbol = getTokenSymbol(token1Id, token1NameFromPool, tokenMetaMap);

    if (!token0Symbol || token0Symbol === 'UNK' || !token1Symbol || token1Symbol === 'UNK') continue;

    const token0Name = getTokenName(token0Id, token0NameFromPool, tokenMetaMap);
    const token1Name = getTokenName(token1Id, token1NameFromPool, tokenMetaMap);

    const tvlUsd = p.poolTvlInUsd ?? p.tvl ?? 0;
    const vol24hUsd = p.poolVolume1dInUsd ?? p.volume1d ?? 0;
    const apr = p.poolApr ?? p.apr ?? calculateApr(vol24hUsd, tvlUsd);

    // get-all-token-pairs provides TVL and volume data
    items.push({
      id: poolId,
      pairLabel: `${token0Name} / ${token1Name} LP`,
      token0: { id: token0Id, symbol: token0Symbol, name: token0Name, iconUrl: getTokenIconUrl(token0Id, network) },
      token1: { id: token1Id, symbol: token1Symbol, name: token1Name, iconUrl: getTokenIconUrl(token1Id, network) },
      tvlUsd,
      token0TvlUsd: p.token0TvlInUsd ?? 0,
      token1TvlUsd: p.token1TvlInUsd ?? 0,
      vol24hUsd,
      vol7dUsd: p.poolVolume7dInUsd ?? p.volume7d ?? 0,
      vol30dUsd: p.poolVolume30dInUsd ?? p.volume30d ?? 0,
      apr,
      // Get reserve amounts from the token objects or top-level
      token0Amount: p.reserve0 || p.token0?.token0Amount || '0',
      token1Amount: p.reserve1 || p.token1?.token1Amount || '0',
      lpTotalSupply: p.tokenSupply || undefined,
    });
  }

  return items;
}

// ============================================================================
// Direct metashrew_view simulate fallback (regtest-local)
// ============================================================================

async function fetchPoolsFromDirectSimulate(
  factoryId: string,
  network: string,
): Promise<PoolsListItem[]> {
  const rpcUrl = network === 'qubitcoin-regtest'
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/rpc/qubitcoin-regtest`
    : 'http://localhost:18888';

  // Factory opcode 3: GetAllPools — returns list of pool AlkaneIds
  const allPoolsHex = await simulateContract(rpcUrl, factoryId, 3);
  const allPoolsData = extractField3Data(allPoolsHex, 32);
  if (!allPoolsData) {
    return [];
  }

  // First u128 = pool count, then pairs of u128 (block, tx)
  const numPools = Number(parseU128LE(allPoolsData, 0));
  const pools: { block: number; tx: number }[] = [];
  for (let i = 0; i < numPools; i++) {
    const offset = 32 + i * 64; // skip count (32 hex chars), each pool = 64 hex chars
    if (offset + 64 > allPoolsData.length) break;
    const block = Number(parseU128LE(allPoolsData, offset));
    const tx = Number(parseU128LE(allPoolsData, offset + 32));
    pools.push({ block, tx });
  }
  const items: PoolsListItem[] = [];
  for (const pool of pools) {
    const poolId = `${pool.block}:${pool.tx}`;
    try {
      // Pool opcode 999: PoolDetails
      const detailsHex = await simulateContract(rpcUrl, poolId, 999);
      const detailsData = extractField3Data(detailsHex, 32);

      // Pool opcode 99: GetName
      const nameHex = await simulateContract(rpcUrl, poolId, 99);
      const nameData = extractField3Data(nameHex, 1);
      let poolName = '';
      if (nameData) {
        for (let i = 0; i < nameData.length; i += 2) {
          const byte = parseInt(nameData.slice(i, i + 2), 16);
          if (byte === 0) break;
          poolName += String.fromCharCode(byte);
        }
      }

      // Pool opcode 97: GetReserves
      const reservesHex = await simulateContract(rpcUrl, poolId, 97);
      const reservesData = extractField3Data(reservesHex, 32);

      let token0Id = '', token1Id = '', token0Symbol = '', token1Symbol = '';
      let token0Amount: string | undefined, token1Amount: string | undefined;

      // Parse pool name "TOKEN0 / TOKEN1 LP" → symbols
      const nameMatch = poolName.match(/^(.+?)\s*\/\s*(.+?)(?:\s*LP)?$/);
      if (nameMatch) {
        token0Symbol = nameMatch[1].trim();
        token1Symbol = nameMatch[2].trim();
      }

      // Parse details for token IDs (PoolDetails format: various u128 fields)
      if (detailsData && detailsData.length >= 128) {
        const t0Block = Number(parseU128LE(detailsData, 0));
        const t0Tx = Number(parseU128LE(detailsData, 32));
        const t1Block = Number(parseU128LE(detailsData, 64));
        const t1Tx = Number(parseU128LE(detailsData, 96));
        token0Id = `${t0Block}:${t0Tx}`;
        token1Id = `${t1Block}:${t1Tx}`;
      }

      // Parse reserves
      if (reservesData && reservesData.length >= 64) {
        token0Amount = parseU128LE(reservesData, 0).toString();
        token1Amount = parseU128LE(reservesData, 32).toString();
      }

      // Resolve known token symbols
      if (token0Id && (!token0Symbol || /^\d+$/.test(token0Symbol))) {
        token0Symbol = KNOWN_TOKENS[token0Id]?.symbol || token0Symbol || token0Id;
      }
      if (token1Id && (!token1Symbol || /^\d+$/.test(token1Symbol))) {
        token1Symbol = KNOWN_TOKENS[token1Id]?.symbol || token1Symbol || token1Id;
      }

      items.push({
        id: poolId,
        pairLabel: `${token0Symbol}/${token1Symbol}`,
        token0: { id: token0Id, symbol: token0Symbol, name: token0Symbol },
        token1: { id: token1Id, symbol: token1Symbol, name: token1Symbol },
        token0Amount,
        token1Amount,
      });
    } catch (e) {
      console.warn('[usePools] Direct simulate: failed to query pool', poolId, e);
    }
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
  tokenMetaMap?: Map<string, { name: string; symbol: string }>,
): Promise<PoolsListItem[]> {
  const rpcResult = await Promise.race([
    provider.alkanesGetAllPoolsWithDetails(factoryId),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('alkanesGetAllPoolsWithDetails timeout (30s)')), 30000)),
  ]);
  const parsed = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult;
  const rpcPools = parsed?.pools || [];

  const items: PoolsListItem[] = [];

  for (const p of rpcPools) {
    const poolId = `${p.pool_id_block}:${p.pool_id_tx}`;
    const d = p.details || {};
    const token0Id = d.token_a_block != null && d.token_a_tx != null
      ? `${d.token_a_block}:${d.token_a_tx}` : '';
    const token1Id = d.token_b_block != null && d.token_b_tx != null
      ? `${d.token_b_block}:${d.token_b_tx}` : '';

    let token0Symbol = getTokenSymbol(token0Id, d.token_a_name, tokenMetaMap);
    let token1Symbol = getTokenSymbol(token1Id, d.token_b_name, tokenMetaMap);

    // Use pool_name to fix numeric-only or missing symbols
    const needsT0Fix = !token0Symbol || token0Symbol === 'UNK' || numericOnlyPattern.test(token0Symbol);
    const needsT1Fix = !token1Symbol || token1Symbol === 'UNK' || numericOnlyPattern.test(token1Symbol);
    if ((needsT0Fix || needsT1Fix) && d.pool_name) {
      const match = d.pool_name.match(/^(.+?)\s*\/\s*(.+?)(?:\s*LP)?$/);
      if (match) {
        if (needsT0Fix) token0Symbol = match[1].trim().replace('SUBFROST BTC', 'frBTC');
        if (needsT1Fix) token1Symbol = match[2].trim().replace('SUBFROST BTC', 'frBTC');
      }
    }

    if (!poolId || !token0Id || !token1Id || !token0Symbol || !token1Symbol) continue;

    const token0Name = getTokenName(token0Id, d.token_a_name, tokenMetaMap);
    const token1Name = getTokenName(token1Id, d.token_b_name, tokenMetaMap);

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
      if (!provider) {
        throw new Error('SDK provider not available');
      }

      // Fetch token metadata in parallel with pool data (espo-backed).
      // Swallow errors here — tokenMeta is enrichment, not required for first paint.
      const tokenMetaPromise: Promise<Map<string, { name: string; symbol: string }>> =
        fetchTokenMetadata(network).catch(() => new Map());

      let items: PoolsListItem[] = [];
      let tokenMetaMap: Map<string, { name: string; symbol: string }> = new Map();

      // regtest-local / devnet: skip REST/SDK fallbacks (devnet's quspo may not
      // have indexed the pool yet; regtest-local REST returns 503 or hangs 30s).
      // Go directly to metashrew_view simulate which reads live on-chain state.
      if (network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'devnet') {
        try { tokenMetaMap = await tokenMetaPromise; } catch { /* ignore */ }
        try {
          items = await fetchPoolsFromDirectSimulate(ALKANE_FACTORY_ID, network);
        } catch (e) {
          console.warn('[usePools] regtest-local/devnet: Direct simulate failed:', e);
        }
        return { items, total: items.length };
      }

      // Mainnet: ONLY the static curated pool list. No discovery phase.
      //
      // Per flex (alkanes-rs maintainer, 2026-05-11):
      //   "There shouldn't be a pool discovery phase at all"
      //   "We have hardcoded pools in there now"
      //
      // Returns synchronously — `getCuratedPoolsListItems()` is a pure
      // constructor over `MAINNET_CURATED_POOLS`, no network call. If we
      // need to add/remove a pool, edit `lib/alkanes/curated-pools.ts`.
      // Live reserves for these pools are fetched separately by the swap
      // quote engine via `usePoolStateLive`; that's a price-math concern,
      // not pool discovery.
      if (network === 'mainnet') {
        items = getCuratedPoolsListItems();
        return { items, total: items.length };
      }

      // Merge fallback pool entries onto the curated set instead of replacing
      // it. The original code overwrote `items = await fallback(...)` whenever
      // a fallback returned anything non-empty, which silently nuked the
      // curated DIESEL/MIST/Bee/DUST entries when /api/pools/cached returned
      // a 2-pool partial list (the espo proxy serves stale partial data
      // before it's fully populated). Symptom: BTC→Token swap picker only
      // surfaced frBTC/bUSD/FIRE despite the curated path having succeeded.
      const mergeItems = (extra: PoolsListItem[]) => {
        const seen = new Set(items.map((p) => p.id));
        for (const p of extra) {
          if (!seen.has(p.id)) {
            items.push(p);
            seen.add(p.id);
          }
        }
      };

      // Primary: Direct REST call to get-all-pools-details (preserves ALL API fields
      // including poolApr, poolVolume30dInUsd, etc. which the SDK WASM deserializer drops).
      // On devnet, the fetch interceptor routes these REST calls through quspo.
      // Pool fetch runs in parallel with tokenMeta — don't block trending on slow tokenMeta.
      // Race tokenMeta against a 250ms budget: if it's already cached, use it for symbol
      // enrichment in the parse loop; otherwise the second pass below handles missing names.
      try {
        const fetched = await fetchPoolsFromPoolsDetailsRest(ALKANE_FACTORY_ID, network, undefined);
        mergeItems(fetched);
        const TOKEN_META_BUDGET_MS = 250;
        tokenMetaMap = await Promise.race([
          tokenMetaPromise,
          new Promise<Map<string, { name: string; symbol: string }>>(
            resolve => setTimeout(() => resolve(new Map()), TOKEN_META_BUDGET_MS),
          ),
        ]);
      } catch (e) {
        console.warn('[usePools] get-all-pools-details REST failed, falling back to SDK WASM:', e);
        try { tokenMetaMap = await tokenMetaPromise; } catch { /* ignore */ }
      }

      // Fallback 1: SDK WASM dataApiGetAllPoolsDetails (may drop some fields like poolApr)
      if (items.length === 0) {
        try {
          mergeItems(await fetchPoolsFromDataApi(provider, ALKANE_FACTORY_ID, network, tokenMetaMap));
        } catch (e) {
          console.warn('[usePools] dataApiGetAllPoolsDetails failed:', e);
        }
      }

      // Fallback 2: get-all-token-pairs REST
      if (items.length === 0) {
        try {
          mergeItems(await fetchPoolsFromTokenPairsRest(ALKANE_FACTORY_ID, network, tokenMetaMap));
        } catch (e) {
          console.warn('[usePools] get-all-token-pairs REST failed:', e);
        }
      }

      // Fallback 2b: dataApiGetAllTokenPairs
      if (items.length === 0) {
        try {
          mergeItems(await fetchPoolsFromTokenPairsApi(provider, ALKANE_FACTORY_ID, network, tokenMetaMap));
        } catch (e) {
          console.warn('[usePools] dataApiGetAllTokenPairs also failed, falling back to RPC:', e);
        }
      }

      // Fallback 3: N+1 RPC simulation calls (no TVL/volume data)
      if (items.length === 0) {
        try {
          mergeItems(await fetchPoolsFromSDKFallback(provider, ALKANE_FACTORY_ID, network, tokenMetaMap));
        } catch (e) {
          console.warn('[usePools] SDK fallback also failed:', e);
        }
      }

      // Fallback 4: direct metashrew_view simulate (factory opcode 3 + per-pool
      // 999). Pure on-chain — no espo / no SDK dependency. Use this when every
      // upstream path (REST + SDK) has failed; loses TVL/volume data but
      // ensures the LP / swap forms can still match pools by token id.
      if (items.length === 0) {
        try {
          mergeItems(await fetchPoolsFromDirectSimulate(ALKANE_FACTORY_ID, network));
          console.warn('[usePools] used direct simulate fallback — TVL/volume fields missing');
        } catch (e) {
          console.warn('[usePools] direct simulate fallback also failed:', e);
        }
      }

      // Second pass: find pool tokens with numeric-only names and fetch metadata individually.
      // Check for *useful* metadata (non-empty, non-numeric name/symbol), not just map presence,
      // because the bulk /get-alkanes fetch may return entries with empty symbols.
      const numericNamePattern = /^\d+$/;
      const metaHasGoodName = (id: string): boolean => {
        const meta = tokenMetaMap.get(id);
        if (!meta) return false;
        return (!!meta.symbol && !numericNamePattern.test(meta.symbol)) ||
               (!!meta.name && !numericNamePattern.test(meta.name));
      };

      const missingIds = new Set<string>();
      for (const item of items) {
        if (numericNamePattern.test(item.token0.symbol) && !metaHasGoodName(item.token0.id)) {
          missingIds.add(item.token0.id);
        }
        if (numericNamePattern.test(item.token1.symbol) && !metaHasGoodName(item.token1.id)) {
          missingIds.add(item.token1.id);
        }
      }
      if (missingIds.size > 0) {
        await fetchMissingTokenMetadata([...missingIds], network, tokenMetaMap);
        // Re-apply proper names from the updated metadata map
        // Use name as fallback for symbol (and vice versa) when one is empty
        items = items.map(item => {
          const t0Meta = tokenMetaMap.get(item.token0.id);
          const t1Meta = tokenMetaMap.get(item.token1.id);
          const token0 = t0Meta && numericNamePattern.test(item.token0.symbol)
            ? { ...item.token0, symbol: t0Meta.symbol || t0Meta.name || item.token0.symbol, name: t0Meta.name || t0Meta.symbol || item.token0.name }
            : item.token0;
          const token1 = t1Meta && numericNamePattern.test(item.token1.symbol)
            ? { ...item.token1, symbol: t1Meta.symbol || t1Meta.name || item.token1.symbol, name: t1Meta.name || t1Meta.symbol || item.token1.name }
            : item.token1;
          return {
            ...item,
            token0,
            token1,
            pairLabel: `${token0.name || token0.symbol} / ${token1.name || token1.symbol} LP`,
          };
        });
      }

      if (items.length === 0) {
        throw new Error('Failed to fetch pools from any source');
      }

      // Token names are already extracted from the data API's poolName field
      // (e.g., "DIESEL / frBTC LP") — no need for extra alkanesReflect calls.

      // Remove known scam/impersonator pools
      const beforeCount = items.length;
      items = items.filter(p => !isBlacklistedPool(p));
      if (items.length < beforeCount) {
      }

      // Remove dust/dead pools with negligible TVL (skip on regtest/devnet where pricing is unavailable).
      //
      // Pools whose `tvlUsd` is `undefined` (vs zero) are kept — undefined
      // means "no TVL data was attached to this entry", which happens on
      // the curated/on-chain fallback paths where reserves come from
      // opcode-999 directly and pricing isn't joined yet. Filtering those
      // out would silently nuke the curated set whenever espo is empty.
      if (!network?.includes('regtest') && network !== 'devnet') {
        const MIN_TVL_USD = 5;
        items = items.filter(p => p.tvlUsd === undefined || p.tvlUsd >= MIN_TVL_USD);
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
