/**
 * Pool Data Service for fetching AMM pool reserves, prices, TVL, volume, and APR
 *
 * Uses Redis caching for performance and the candle-fetcher module for raw data.
 */

import { cacheGet, cacheSet } from '@/lib/redis';
import {
  getAlkanesClient,
  getPools,
  calculatePrice as calcPrice,
  type PoolConfig,
} from '@/lib/alkanes-client';
import {
  fetchPoolDataPoints,
  fetchDieselStats,
  estimate24hVolume,
  estimateVolume,
  calculatePoolTvl,
  getCurrentHeight,
  POOL_FEES,
  DIESEL_TOKEN,
  type PoolDataPoint,
  type CandleData,
  type DieselMarketStats,
  type TvlStats,
  type VolumePeriod,
} from './candle-fetcher';

// ============================================================================
// Cache TTLs (in seconds)
// ============================================================================

const CACHE_TTL = {
  PRICES: 30,       // Current prices
  CANDLES: 300,     // Historical candles
  BTC_PRICE: 60,    // BTC/USD price
  VOLUME: 300,      // 24h volume
  STATS: 60,        // Dashboard stats
  RESERVES: 30,     // Pool reserves
};

// ============================================================================
// Types
// ============================================================================

export interface PoolReserves {
  poolId: string;
  poolName: string;
  token0Symbol: string;
  token1Symbol: string;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  blockHeight: number;
  timestamp?: number;
}

export interface PoolPrice {
  poolId: string;
  poolName: string;
  price: number;
  priceInverse: number;
  reserve0: bigint;
  reserve1: bigint;
  blockHeight: number;
  timestamp?: number;
}

export interface SerializedPoolPrice {
  poolId: string;
  poolName: string;
  price: number;
  priceInverse: number;
  reserve0: string;
  reserve1: string;
  blockHeight: number;
  timestamp?: number;
}

export interface PoolVolume {
  poolId: string;
  poolName: string;
  volume: number;
  volumeUsd?: number;
  volume24h: number;
  volume24hUsd?: number;
  volume7d?: number;
  volume7dUsd?: number;
  volume30d?: number;
  volume30dUsd?: number;
  period: VolumePeriod;
  startHeight: number;
  endHeight: number;
  timestamp: number;
}

// Re-export VolumePeriod for consumers
export type { VolumePeriod };

export interface PoolStats {
  poolId: string;
  poolName: string;
  price: number;
  priceInverse: number;
  tvlUsd: number;
  tvlToken0: number;
  tvlToken1: number;
  volume24hUsd: number;
  volume30dUsd?: number;
  apr: number;
  reserve0: bigint;
  reserve1: bigint;
  lpTotalSupply: bigint;
  token0Symbol: string;
  token1Symbol: string;
  timestamp: number;
}

export interface BitcoinPrice {
  usd: number;
  timestamp: number;
}

export interface DashboardStats {
  marketStats: DieselMarketStats;
  tvlStats: TvlStats;
  btcPrice: BitcoinPrice;
  pools: Record<string, PoolStats>;
  timestamp: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function serializePoolPrice(price: PoolPrice): SerializedPoolPrice {
  return {
    ...price,
    reserve0: price.reserve0.toString(),
    reserve1: price.reserve1.toString(),
  };
}

function deserializePoolPrice(data: SerializedPoolPrice): PoolPrice {
  return {
    ...data,
    reserve0: BigInt(data.reserve0),
    reserve1: BigInt(data.reserve1),
  };
}

// ============================================================================
// Bitcoin Price
// ============================================================================

/**
 * Get current Bitcoin price in USD (with caching)
 * Always uses mainnet since BTC price is network-agnostic
 */
export async function getBitcoinPrice(_network?: string): Promise<BitcoinPrice> {
  const cacheKey = 'btc:price:usd';

  const cached = await cacheGet<BitcoinPrice>(cacheKey);
  if (cached) {
    return cached;
  }

  // Always use mainnet for BTC price - it's the same across all networks
  const client = getAlkanesClient('mainnet');
  const price = await client.getBitcoinPrice();
  const result: BitcoinPrice = {
    usd: price,
    timestamp: Date.now(),
  };

  await cacheSet(cacheKey, result, CACHE_TTL.BTC_PRICE);
  return result;
}

// ============================================================================
// Block Height
// ============================================================================

/**
 * Get the current block height (with short caching)
 * @param network - Optional network name for network-specific client
 */
export async function getCurrentBlockHeight(network?: string): Promise<number> {
  const netSuffix = network || 'default';
  const cacheKey = `pool:blockHeight:${netSuffix}`;

  const cached = await cacheGet<number>(cacheKey);
  if (cached !== null) return cached;

  const height = await getCurrentHeight(network);
  await cacheSet(cacheKey, height, 10);

  return height;
}

// ============================================================================
// Pool Reserves
// ============================================================================

/**
 * Fetch pool reserves
 * @param network - Optional network name for network-specific client
 */
export async function getPoolReserves(poolKey: string, network?: string): Promise<PoolReserves | null> {
  const pools = getPools(network);
  const pool = pools[poolKey];
  if (!pool) return null;

  const netSuffix = network || 'default';
  const cacheKey = `pool:reserves:${pool.id}:${netSuffix}`;

  const cached = await cacheGet<{
    reserve0: string;
    reserve1: string;
    totalSupply: string;
    blockHeight: number;
  }>(cacheKey);

  if (cached) {
    return {
      poolId: pool.id,
      poolName: pool.name,
      token0Symbol: pool.token0Symbol,
      token1Symbol: pool.token1Symbol,
      reserve0: BigInt(cached.reserve0),
      reserve1: BigInt(cached.reserve1),
      totalSupply: BigInt(cached.totalSupply),
      blockHeight: cached.blockHeight,
    };
  }

  const client = getAlkanesClient(network);
  const reserves = await client.getPoolReserves(pool);
  if (!reserves) return null;

  const height = await getCurrentBlockHeight(network);

  await cacheSet(cacheKey, {
    reserve0: reserves.reserve0.toString(),
    reserve1: reserves.reserve1.toString(),
    totalSupply: reserves.totalSupply.toString(),
    blockHeight: height,
  }, CACHE_TTL.RESERVES);

  return {
    poolId: pool.id,
    poolName: pool.name,
    token0Symbol: pool.token0Symbol,
    token1Symbol: pool.token1Symbol,
    reserve0: reserves.reserve0,
    reserve1: reserves.reserve1,
    totalSupply: reserves.totalSupply,
    blockHeight: height,
  };
}

// ============================================================================
// Pool Price
// ============================================================================

/**
 * Get current pool price with caching
 * @param network - Optional network name for network-specific client
 */
export async function getPoolPrice(poolKey: string, network?: string): Promise<PoolPrice | null> {
  const pools = getPools(network);
  const pool = pools[poolKey];
  if (!pool) return null;

  const netSuffix = network || 'default';
  const cacheKey = `pool:price:${pool.id}:${netSuffix}`;

  const cached = await cacheGet<SerializedPoolPrice>(cacheKey);
  if (cached) {
    return deserializePoolPrice(cached);
  }

  const reserves = await getPoolReserves(poolKey, network);
  if (!reserves) return null;

  const price = calcPrice(
    reserves.reserve0,
    reserves.reserve1,
    pool.token0Decimals,
    pool.token1Decimals
  );

  const result: PoolPrice = {
    poolId: pool.id,
    poolName: pool.name,
    price,
    priceInverse: price > 0 ? 1 / price : 0,
    reserve0: reserves.reserve0,
    reserve1: reserves.reserve1,
    blockHeight: reserves.blockHeight,
    timestamp: Date.now(),
  };

  await cacheSet(cacheKey, serializePoolPrice(result), CACHE_TTL.PRICES);
  return result;
}

/**
 * Get all pool prices (optimized batch fetch)
 * @param network - Optional network name for network-specific client
 */
export async function getAllPoolPrices(network?: string): Promise<Record<string, PoolPrice>> {
  const pools = getPools(network);
  const poolKeys = Object.keys(pools);

  const prices = await Promise.all(
    poolKeys.map(key => getPoolPrice(key, network))
  );

  const result: Record<string, PoolPrice> = {};
  for (let i = 0; i < poolKeys.length; i++) {
    const price = prices[i];
    if (price) {
      result[poolKeys[i]] = price;
    }
  }

  return result;
}

// ============================================================================
// Pool Volume
// ============================================================================

/** Cache TTL for different volume periods */
const VOLUME_CACHE_TTL: Record<VolumePeriod, number> = {
  '24h': 300,    // 5 minutes
  '7d': 600,     // 10 minutes
  '30d': 900,    // 15 minutes
};

/**
 * Convert volume to USD based on token1 symbol
 */
async function convertVolumeToUsd(
  volumeToken1: number,
  token1Symbol: string,
  network?: string
): Promise<number> {
  if (token1Symbol === 'bUSD') {
    return volumeToken1;
  }
  if (token1Symbol === 'frBTC') {
    try {
      const btcPrice = await getBitcoinPrice(network);
      return volumeToken1 * btcPrice.usd;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Get trading volume estimate for a pool over a specified period
 * @param poolKey - Pool key (e.g., 'DIESEL_BUSD')
 * @param period - Time period ('24h', '7d', or '30d')
 * @param network - Optional network name for network-specific client
 */
export async function getPoolVolume(
  poolKey: string,
  period: VolumePeriod = '24h',
  network?: string
): Promise<PoolVolume | null> {
  const pools = getPools(network);
  const pool = pools[poolKey];
  if (!pool) return null;

  const netSuffix = network || 'default';
  const cacheKey = `pool:volume:${pool.id}:${period}:${netSuffix}`;

  const cached = await cacheGet<PoolVolume>(cacheKey);
  if (cached) {
    return cached;
  }

  const volumeData = await estimateVolume(poolKey, period, network);
  const volumeUsd = await convertVolumeToUsd(volumeData.volumeToken1, pool.token1Symbol, network);

  const result: PoolVolume = {
    poolId: pool.id,
    poolName: pool.name,
    volume: volumeData.volumeToken1,
    volumeUsd,
    volume24h: period === '24h' ? volumeData.volumeToken1 : 0,
    volume24hUsd: period === '24h' ? volumeUsd : undefined,
    volume7d: period === '7d' ? volumeData.volumeToken1 : undefined,
    volume7dUsd: period === '7d' ? volumeUsd : undefined,
    volume30d: period === '30d' ? volumeData.volumeToken1 : undefined,
    volume30dUsd: period === '30d' ? volumeUsd : undefined,
    period,
    startHeight: volumeData.startHeight,
    endHeight: volumeData.endHeight,
    timestamp: Date.now(),
  };

  await cacheSet(cacheKey, result, VOLUME_CACHE_TTL[period]);
  return result;
}

/**
 * Get volume for all pools over a specified period
 * @param period - Time period ('24h', '7d', or '30d')
 * @param network - Optional network name for network-specific client
 */
export async function getAllPoolVolumes(
  period: VolumePeriod = '24h',
  network?: string
): Promise<Record<string, PoolVolume>> {
  const pools = getPools(network);
  const poolKeys = Object.keys(pools);

  const volumes = await Promise.all(
    poolKeys.map(key => getPoolVolume(key, period, network))
  );

  const result: Record<string, PoolVolume> = {};
  for (let i = 0; i < poolKeys.length; i++) {
    const volume = volumes[i];
    if (volume) {
      result[poolKeys[i]] = volume;
    }
  }

  return result;
}

// ============================================================================
// APR Calculation
// ============================================================================

/**
 * Calculate APR for a pool
 * APR = (daily_volume × LP_fee_rate × 365) / TVL × 100
 */
export function calculateApr(volume24hUsd: number, tvlUsd: number): number {
  if (tvlUsd <= 0) return 0;

  const lpFeeRate = POOL_FEES.LP_FEE_PER_1000 / 1000; // 0.008 = 0.8%
  const dailyFees = volume24hUsd * lpFeeRate;
  const annualFees = dailyFees * 365;
  const apr = (annualFees / tvlUsd) * 100;

  return apr;
}

// ============================================================================
// Pool Stats (Combined)
// ============================================================================

/**
 * Get complete stats for a single pool
 * @param network - Optional network name for network-specific client
 */
export async function getPoolStats(poolKey: string, network?: string): Promise<PoolStats | null> {
  const pools = getPools(network);
  const pool = pools[poolKey];
  if (!pool) return null;

  const netSuffix = network || 'default';
  const cacheKey = `pool:stats:${pool.id}:${netSuffix}`;

  const cached = await cacheGet<PoolStats & { reserve0: string; reserve1: string; lpTotalSupply: string }>(cacheKey);
  if (cached) {
    return {
      ...cached,
      reserve0: BigInt(cached.reserve0),
      reserve1: BigInt(cached.reserve1),
      lpTotalSupply: BigInt(cached.lpTotalSupply),
    };
  }

  const [price, volume, btcPrice] = await Promise.all([
    getPoolPrice(poolKey, network),
    getPoolVolume(poolKey, '24h', network),
    getBitcoinPrice(network),
  ]);

  if (!price) return null;

  // Calculate TVL
  const token1PriceUsd = pool.token1Symbol === 'frBTC' ? btcPrice.usd : 1; // bUSD = 1 USD
  const { tvlToken0, tvlToken1, tvlUsd } = calculatePoolTvl(
    price.reserve0,
    price.reserve1,
    pool.token0Decimals,
    pool.token1Decimals,
    token1PriceUsd
  );

  const volume24hUsd = volume?.volume24hUsd || 0;
  const apr = calculateApr(volume24hUsd, tvlUsd);

  const result: PoolStats = {
    poolId: pool.id,
    poolName: pool.name,
    price: price.price,
    priceInverse: price.priceInverse,
    tvlUsd,
    tvlToken0,
    tvlToken1,
    volume24hUsd,
    apr,
    reserve0: price.reserve0,
    reserve1: price.reserve1,
    lpTotalSupply: price.reserve0, // Use reserves as proxy for LP supply
    token0Symbol: pool.token0Symbol,
    token1Symbol: pool.token1Symbol,
    timestamp: Date.now(),
  };

  await cacheSet(cacheKey, {
    ...result,
    reserve0: result.reserve0.toString(),
    reserve1: result.reserve1.toString(),
    lpTotalSupply: result.lpTotalSupply.toString(),
  }, CACHE_TTL.STATS);

  return result;
}

/**
 * Get stats for all pools
 * @param network - Optional network name for network-specific client
 */
export async function getAllPoolStats(network?: string): Promise<Record<string, PoolStats>> {
  const pools = getPools(network);
  const poolKeys = Object.keys(pools);

  const stats = await Promise.all(
    poolKeys.map(key => getPoolStats(key, network))
  );

  const result: Record<string, PoolStats> = {};
  for (let i = 0; i < poolKeys.length; i++) {
    const stat = stats[i];
    if (stat) {
      result[poolKeys[i]] = stat;
    }
  }

  return result;
}

// ============================================================================
// Dashboard Stats
// ============================================================================

/**
 * Get all dashboard stats in one optimized call
 * @param network - Optional network name for network-specific client
 */
export async function getDashboardStats(network?: string): Promise<DashboardStats> {
  const netSuffix = network || 'default';
  const cacheKey = `dashboard:stats:${netSuffix}`;

  const cached = await cacheGet<any>(cacheKey);
  if (cached) {
    // Deserialize bigints
    const pools: Record<string, PoolStats> = {};
    for (const [key, pool] of Object.entries(cached.pools as Record<string, any>)) {
      pools[key] = {
        ...pool,
        reserve0: BigInt(pool.reserve0),
        reserve1: BigInt(pool.reserve1),
        lpTotalSupply: BigInt(pool.lpTotalSupply),
      };
    }

    const tvlPools: TvlStats['pools'] = {};
    for (const [key, pool] of Object.entries(cached.tvlStats.pools as Record<string, any>)) {
      tvlPools[key] = {
        ...pool,
        reserve0: BigInt(pool.reserve0),
        reserve1: BigInt(pool.reserve1),
        lpTotalSupply: BigInt(pool.lpTotalSupply),
      };
    }

    return {
      marketStats: {
        ...cached.marketStats,
        totalSupply: BigInt(cached.marketStats.totalSupply),
      },
      tvlStats: {
        pools: tvlPools,
        totalTvlUsd: cached.tvlStats.totalTvlUsd,
        timestamp: cached.tvlStats.timestamp,
      },
      btcPrice: cached.btcPrice,
      pools,
      timestamp: cached.timestamp,
    };
  }

  // Fetch fresh data
  const [btcPrice, poolStats, dieselStats] = await Promise.all([
    getBitcoinPrice(network),
    getAllPoolStats(network),
    fetchDieselStats(network),
  ]);

  // Calculate market stats
  let dieselPriceBtc = 0;
  const frbtcStats = poolStats.DIESEL_FRBTC;
  if (frbtcStats) {
    dieselPriceBtc = frbtcStats.price;
  }
  const dieselPriceUsd = dieselPriceBtc * btcPrice.usd;
  const totalSupplyFormatted = Number(dieselStats.dieselTotalSupply) / Math.pow(10, DIESEL_TOKEN.decimals);
  const marketCapUsd = totalSupplyFormatted * dieselPriceUsd;

  const marketStats: DieselMarketStats = {
    totalSupply: dieselStats.dieselTotalSupply,
    totalSupplyFormatted,
    priceUsd: dieselPriceUsd,
    priceBtc: dieselPriceBtc,
    marketCapUsd,
    timestamp: Date.now(),
  };

  // Calculate TVL stats
  const tvlPools: TvlStats['pools'] = {};
  let totalTvlUsd = 0;

  for (const [key, stats] of Object.entries(poolStats)) {
    tvlPools[key] = {
      poolId: stats.poolId,
      poolName: stats.poolName,
      reserve0: stats.reserve0,
      reserve1: stats.reserve1,
      tvlToken0: stats.tvlToken0,
      tvlToken1: stats.tvlToken1,
      tvlUsd: stats.tvlUsd,
      lpTotalSupply: stats.lpTotalSupply,
    };
    totalTvlUsd += stats.tvlUsd;
  }

  const tvlStats: TvlStats = {
    pools: tvlPools,
    totalTvlUsd,
    timestamp: Date.now(),
  };

  const result: DashboardStats = {
    marketStats,
    tvlStats,
    btcPrice,
    pools: poolStats,
    timestamp: Date.now(),
  };

  // Serialize for caching
  const serialized = {
    marketStats: {
      ...marketStats,
      totalSupply: marketStats.totalSupply.toString(),
    },
    tvlStats: {
      pools: {} as Record<string, any>,
      totalTvlUsd: tvlStats.totalTvlUsd,
      timestamp: tvlStats.timestamp,
    },
    btcPrice,
    pools: {} as Record<string, any>,
    timestamp: result.timestamp,
  };

  for (const [key, pool] of Object.entries(tvlStats.pools)) {
    serialized.tvlStats.pools[key] = {
      ...pool,
      reserve0: pool.reserve0.toString(),
      reserve1: pool.reserve1.toString(),
      lpTotalSupply: pool.lpTotalSupply.toString(),
    };
  }

  for (const [key, pool] of Object.entries(poolStats)) {
    serialized.pools[key] = {
      ...pool,
      reserve0: pool.reserve0.toString(),
      reserve1: pool.reserve1.toString(),
      lpTotalSupply: pool.lpTotalSupply.toString(),
    };
  }

  await cacheSet(cacheKey, serialized, CACHE_TTL.STATS);

  return result;
}

// ============================================================================
// Exports
// ============================================================================

export {
  getPools,
  POOL_FEES,
  DIESEL_TOKEN,
};

export type {
  PoolConfig,
  PoolDataPoint,
  CandleData,
  DieselMarketStats,
  TvlStats,
};
