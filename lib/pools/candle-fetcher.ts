/**
 * Candle Data Fetcher using Lua scripts
 *
 * This module provides the core logic for fetching pool candle data using
 * lua_evalscript with metashrew_view. Uses alkanes-client for RPC calls.
 */

import { getAlkanesClient, type PoolConfig, getPools, calculatePrice } from '@/lib/alkanes-client';

// ============================================================================
// Types
// ============================================================================

export interface PoolDataPoint {
  height: number;
  timestamp?: number;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
}

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface DieselMarketStats {
  totalSupply: bigint;
  totalSupplyFormatted: number;
  priceUsd: number;
  priceBtc: number;
  marketCapUsd: number;
  timestamp: number;
}

export interface TvlStats {
  pools: {
    [key: string]: {
      poolId: string;
      poolName: string;
      reserve0: bigint;
      reserve1: bigint;
      tvlToken0: number;
      tvlToken1: number;
      tvlUsd: number;
      lpTotalSupply: bigint;
    };
  };
  totalTvlUsd: number;
  timestamp: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Fee constants from oyl-amm contracts */
export const POOL_FEES = {
  TOTAL_FEE_PER_1000: 10,    // 1% total fee
  PROTOCOL_FEE_PER_1000: 2,  // 0.2% protocol fee
  LP_FEE_PER_1000: 8,        // 0.8% LP fee
};

/** DIESEL token configuration */
export const DIESEL_TOKEN = {
  block: 2,
  tx: 0,
  id: '2:0',
  symbol: 'DIESEL',
  decimals: 8,
  totalSupplyPayload: '0x20e3ce382a030200653001',
};

// ============================================================================
// Lua Scripts
// ============================================================================

/**
 * Lua script for fetching pool candles using metashrew_view
 * Returns reserve data at multiple block heights for OHLC charting
 */
export const POOL_CANDLES_LUA_SCRIPT = `
-- Pool candles: Fetch pool reserves at multiple block heights for OHLC data
local params = args[1] or {}
local pool_payload = params[1]
local start_height = tonumber(params[2])
local end_height = tonumber(params[3])
local interval = tonumber(params[4]) or 144

if not pool_payload or not start_height or not end_height then
    return { error = "Missing required arguments" }
end

local function parse_u128_le(hex_str, byte_offset)
    local hex_offset = byte_offset * 2
    local hex_len = 32
    if #hex_str < hex_offset + hex_len then return nil end
    local hex_slice = hex_str:sub(hex_offset + 1, hex_offset + hex_len)
    local reversed = ""
    for i = #hex_slice - 1, 1, -2 do
        reversed = reversed .. hex_slice:sub(i, i + 1)
    end
    return tonumber(reversed, 16) or 0
end

local function get_block_timestamp(height)
    local success, block_hash = pcall(function()
        return _RPC.btc_getblockhash(height)
    end)
    if not success or not block_hash then return nil end

    local success2, block = pcall(function()
        return _RPC.btc_getblock(block_hash, 1)
    end)
    if not success2 or not block then return nil end

    return block.time or block.mediantime
end

local results = { data_points = {} }

for height = start_height, end_height, interval do
    local block_tag = tostring(height)
    local success, response = pcall(function()
        return _RPC.metashrew_view("simulate", pool_payload, block_tag)
    end)

    if success and response and type(response) == "string" then
        local data_hex = response
        if data_hex:sub(1, 2) == "0x" then
            data_hex = data_hex:sub(3)
        end

        local inner_start = nil
        if #data_hex >= 8 then
            local marker_pos = data_hex:find("1a")
            if marker_pos then
                local len_byte = tonumber(data_hex:sub(marker_pos + 2, marker_pos + 3), 16) or 0
                inner_start = marker_pos + (len_byte < 128 and 4 or 6)
            end
        end

        if inner_start and #data_hex >= inner_start + 223 then
            local inner_hex = data_hex:sub(inner_start)
            local reserve_a = parse_u128_le(inner_hex, 64)
            local reserve_b = parse_u128_le(inner_hex, 80)
            local total_supply = parse_u128_le(inner_hex, 96)

            if reserve_a and reserve_b and total_supply then
                local timestamp = get_block_timestamp(height)

                table.insert(results.data_points, {
                    height = height,
                    timestamp = timestamp,
                    reserve_a = reserve_a,
                    reserve_b = reserve_b,
                    total_supply = total_supply
                })
            end
        end
    end
end

results.count = #results.data_points
return results
`;

/**
 * Lua script to fetch all stats in a single call:
 * - DIESEL total supply
 * - Both pool reserves
 * - Current block height
 */
export const STATS_LUA_SCRIPT = `
local results = {
  diesel = {},
  pools = {},
  height = 0
}

local function parse_u128_le(hex_str, byte_offset)
    local hex_offset = byte_offset * 2
    local hex_len = 32
    if #hex_str < hex_offset + hex_len then return nil end
    local hex_slice = hex_str:sub(hex_offset + 1, hex_offset + hex_len)
    local reversed = ""
    for i = #hex_slice - 1, 1, -2 do
        reversed = reversed .. hex_slice:sub(i, i + 1)
    end
    return tonumber(reversed, 16) or 0
end

local function parse_total_supply(hex_str)
    if not hex_str then return nil end
    if hex_str:sub(1, 2) == "0x" then
        hex_str = hex_str:sub(3)
    end
    local marker_pos = hex_str:find("1a")
    if not marker_pos then return nil end
    local value_start = marker_pos + 4
    local value_end = hex_str:find("10", value_start)
    if not value_end then return nil end
    local value_hex = hex_str:sub(value_start, value_end - 1)
    while #value_hex < 32 do value_hex = value_hex .. "0" end
    local reversed = ""
    for i = #value_hex - 1, 1, -2 do
        reversed = reversed .. value_hex:sub(i, i + 1)
    end
    return tonumber(reversed, 16) or 0
end

local success, height_result = pcall(function()
    return _RPC.metashrew_height()
end)
if success and height_result then
    results.height = tonumber(height_result) or 0
end

local success, diesel_response = pcall(function()
    return _RPC.metashrew_view("simulate", "0x20e3ce382a030200653001", "latest")
end)
if success and diesel_response then
    results.diesel.total_supply = parse_total_supply(diesel_response)
end

local success, frbtc_response = pcall(function()
    return _RPC.metashrew_view("simulate", "0x2096ce382a06029fda04e7073001", "latest")
end)
if success and frbtc_response then
    local data_hex = frbtc_response
    if data_hex:sub(1, 2) == "0x" then
        data_hex = data_hex:sub(3)
    end
    local marker_pos = data_hex:find("1a")
    if marker_pos then
        local len_byte = tonumber(data_hex:sub(marker_pos + 2, marker_pos + 3), 16) or 0
        local inner_start = marker_pos + (len_byte < 128 and 4 or 6)
        if #data_hex >= inner_start + 223 then
            local inner_hex = data_hex:sub(inner_start)
            results.pools.DIESEL_FRBTC = {
                reserve_a = parse_u128_le(inner_hex, 64),
                reserve_b = parse_u128_le(inner_hex, 80),
                total_supply = parse_u128_le(inner_hex, 96)
            }
        end
    end
end

local success, busd_response = pcall(function()
    return _RPC.metashrew_view("simulate", "0x2096ce382a0602d99604e7073001", "latest")
end)
if success and busd_response then
    local data_hex = busd_response
    if data_hex:sub(1, 2) == "0x" then
        data_hex = data_hex:sub(3)
    end
    local marker_pos = data_hex:find("1a")
    if marker_pos then
        local len_byte = tonumber(data_hex:sub(marker_pos + 2, marker_pos + 3), 16) or 0
        local inner_start = marker_pos + (len_byte < 128 and 4 or 6)
        if #data_hex >= inner_start + 223 then
            local inner_hex = data_hex:sub(inner_start)
            results.pools.DIESEL_BUSD = {
                reserve_a = parse_u128_le(inner_hex, 64),
                reserve_b = parse_u128_le(inner_hex, 80),
                total_supply = parse_u128_le(inner_hex, 96)
            }
        end
    end
end

return results
`;

// ============================================================================
// Data Fetching Functions
// ============================================================================

interface LuaScriptResult {
  data_points?: Array<{
    height: number;
    timestamp?: number;
    reserve_a: number;
    reserve_b: number;
    total_supply: number;
  }>;
  error?: string;
  count?: number;
}

/**
 * Fetch pool data points using lua_evalscript RPC
 * @param network - Optional network name for network-specific client
 */
export async function fetchPoolDataPoints(
  poolKey: string,
  startHeight: number,
  endHeight: number,
  interval: number,
  network?: string
): Promise<PoolDataPoint[]> {
  const pools = getPools(network);
  const pool = pools[poolKey];
  if (!pool) {
    console.warn(`[CandleFetcher] Unknown pool: ${poolKey}`);
    return [];
  }

  try {
    const client = getAlkanesClient(network);
    const luaResult = await client.executeLuaScript<LuaScriptResult>(
      POOL_CANDLES_LUA_SCRIPT,
      [[pool.protobufPayload, startHeight.toString(), endHeight.toString(), interval.toString()]]
    );

    if (luaResult?.error) {
      throw new Error(`Lua script error: ${luaResult.error}`);
    }

    const dataPoints = luaResult?.data_points || [];
    return dataPoints.map(dp => ({
      height: dp.height,
      timestamp: dp.timestamp,
      reserve0: BigInt(Math.floor(dp.reserve_a)),
      reserve1: BigInt(Math.floor(dp.reserve_b)),
      totalSupply: BigInt(Math.floor(dp.total_supply)),
    }));
  } catch (error) {
    console.error('[CandleFetcher] Error fetching pool data points:', error);
    return [];
  }
}

/**
 * Get current block height
 * @param network - Optional network name for network-specific client
 */
export async function getCurrentHeight(network?: string): Promise<number> {
  const client = getAlkanesClient(network);
  return client.getCurrentHeight();
}

/**
 * Build candles from pool data points
 */
export function buildCandlesFromDataPoints(
  dataPoints: PoolDataPoint[],
  pool: PoolConfig,
  candleBlocks: number = 144
): CandleData[] {
  if (dataPoints.length === 0) return [];

  const sorted = [...dataPoints].sort((a, b) => a.height - b.height);

  const candles: CandleData[] = [];
  let candleStartBlock = sorted[0].height;
  let candleStartTimestamp = sorted[0].timestamp ? sorted[0].timestamp * 1000 : Date.now();
  let candlePrices: number[] = [];

  for (const dp of sorted) {
    const price = calculatePrice(dp.reserve0, dp.reserve1, pool.token0Decimals, pool.token1Decimals);

    if (dp.height >= candleStartBlock + candleBlocks) {
      if (candlePrices.length > 0) {
        candles.push({
          timestamp: candleStartTimestamp,
          open: candlePrices[0],
          high: Math.max(...candlePrices),
          low: Math.min(...candlePrices),
          close: candlePrices[candlePrices.length - 1],
        });
      }

      candleStartBlock = Math.floor(dp.height / candleBlocks) * candleBlocks;
      candleStartTimestamp = dp.timestamp ? dp.timestamp * 1000 : Date.now();
      candlePrices = [price];
    } else {
      candlePrices.push(price);
    }
  }

  if (candlePrices.length > 0) {
    candles.push({
      timestamp: candleStartTimestamp,
      open: candlePrices[0],
      high: Math.max(...candlePrices),
      low: Math.min(...candlePrices),
      close: candlePrices[candlePrices.length - 1],
    });
  }

  return candles;
}

// ============================================================================
// Volume Estimation
// ============================================================================

/**
 * Estimate trading volume between two data points using constant product formula
 *
 * Volume estimation approach:
 * - In a constant product AMM (x * y = k), swaps cause k to grow due to fees
 * - Volume = fee_collected / fee_rate
 */
export function estimateVolumeBetweenPoints(
  startPoint: PoolDataPoint,
  endPoint: PoolDataPoint,
  decimals0: number,
  decimals1: number
): number {
  const k0 = Number(startPoint.reserve0) * Number(startPoint.reserve1);
  const k1 = Number(endPoint.reserve0) * Number(endPoint.reserve1);

  if (k0 <= 0 || k1 <= 0) return 0;

  const sqrtK0 = Math.sqrt(k0);
  const sqrtK1 = Math.sqrt(k1);

  if (sqrtK1 <= sqrtK0) return 0;

  const sqrtKGrowth = (sqrtK1 - sqrtK0) / sqrtK0;

  const reserve1Adjusted = Number(startPoint.reserve1) / Math.pow(10, decimals1);
  const tvl = reserve1Adjusted * 2;

  const feeEarned = tvl * sqrtKGrowth;
  const lpFeeRate = POOL_FEES.LP_FEE_PER_1000 / 1000;
  const estimatedVolume = feeEarned / lpFeeRate;

  return estimatedVolume;
}

/** Volume period type */
export type VolumePeriod = '24h' | '7d' | '30d';

/** Blocks per period (assuming ~10 min blocks) */
export const BLOCKS_PER_PERIOD: Record<VolumePeriod, number> = {
  '24h': 144,    // 24 hours
  '7d': 1008,    // 7 days
  '30d': 4320,   // 30 days
};

/** Sample intervals per period (to avoid fetching too many data points) */
const SAMPLE_INTERVALS: Record<VolumePeriod, number> = {
  '24h': 6,      // Every ~1 hour
  '7d': 24,      // Every ~4 hours
  '30d': 72,     // Every ~12 hours
};

/**
 * Calculate volume estimate for a pool over a specified period
 * @param poolKey - Pool key (e.g., 'DIESEL_BUSD')
 * @param period - Time period ('24h', '7d', or '30d')
 * @param network - Optional network name for network-specific client
 */
export async function estimateVolume(
  poolKey: string,
  period: VolumePeriod = '24h',
  network?: string
): Promise<{
  volume: number;
  volumeToken1: number;
  volumeUsd?: number;
  startHeight: number;
  endHeight: number;
  samples: number;
  period: VolumePeriod;
}> {
  const pools = getPools(network);
  const pool = pools[poolKey];
  if (!pool) {
    return { volume: 0, volumeToken1: 0, startHeight: 0, endHeight: 0, samples: 0, period };
  }

  const currentHeight = await getCurrentHeight(network);
  const blocksInPeriod = BLOCKS_PER_PERIOD[period];
  const sampleInterval = SAMPLE_INTERVALS[period];
  const startHeight = currentHeight - blocksInPeriod;

  const dataPoints = await fetchPoolDataPoints(poolKey, startHeight, currentHeight, sampleInterval, network);

  if (dataPoints.length < 2) {
    return {
      volume: 0,
      volumeToken1: 0,
      startHeight,
      endHeight: currentHeight,
      samples: dataPoints.length,
      period,
    };
  }

  let totalVolume = 0;
  for (let i = 1; i < dataPoints.length; i++) {
    const segmentVolume = estimateVolumeBetweenPoints(
      dataPoints[i - 1],
      dataPoints[i],
      pool.token0Decimals,
      pool.token1Decimals
    );
    totalVolume += segmentVolume;
  }

  return {
    volume: totalVolume,
    volumeToken1: totalVolume,
    startHeight,
    endHeight: currentHeight,
    samples: dataPoints.length,
    period,
  };
}

/**
 * Calculate 24h volume estimate for a pool (convenience wrapper)
 * @param network - Optional network name for network-specific client
 */
export async function estimate24hVolume(
  poolKey: string,
  sampleInterval: number = 6,
  network?: string
): Promise<{
  volume: number;
  volumeToken1: number;
  volumeUsd?: number;
  startHeight: number;
  endHeight: number;
  samples: number;
}> {
  const result = await estimateVolume(poolKey, '24h', network);
  return {
    volume: result.volume,
    volumeToken1: result.volumeToken1,
    startHeight: result.startHeight,
    endHeight: result.endHeight,
    samples: result.samples,
  };
}

// ============================================================================
// TVL Calculation
// ============================================================================

/**
 * Calculate TVL for a pool
 * For a constant product AMM (x * y = k), both sides are always equal in USD value.
 *
 * token0's USD value = reserve0 * token0PriceUsd
 *                    = reserve0 * (reserve1/reserve0) * token1PriceUsd
 *                    = reserve1 * token1PriceUsd
 * token1's USD value = reserve1 * token1PriceUsd
 *
 * Total TVL = token0TvlUsd + token1TvlUsd = 2 * reserve1 * token1PriceUsd
 */
export function calculatePoolTvl(
  _reserve0: bigint,
  reserve1: bigint,
  _decimals0: number,
  decimals1: number,
  token1PriceUsd: number
): { tvlToken0: number; tvlToken1: number; tvlUsd: number } {
  const reserve1Formatted = Number(reserve1) / Math.pow(10, decimals1);

  // In a constant product AMM, both sides are equal in USD value
  const token1TvlUsd = reserve1Formatted * token1PriceUsd;
  const token0TvlUsd = token1TvlUsd; // Equal by AMM design
  const tvlUsd = token0TvlUsd + token1TvlUsd;

  return { tvlToken0: token0TvlUsd, tvlToken1: token1TvlUsd, tvlUsd };
}

// ============================================================================
// Stats Fetching
// ============================================================================

interface StatsLuaResult {
  diesel?: {
    total_supply?: number;
  };
  pools?: {
    DIESEL_FRBTC?: {
      reserve_a: number;
      reserve_b: number;
      total_supply: number;
    };
    DIESEL_BUSD?: {
      reserve_a: number;
      reserve_b: number;
      total_supply: number;
    };
  };
  height?: number;
}

/**
 * Fetch all DIESEL stats in a single RPC call
 * @param network - Optional network name for network-specific client
 */
export async function fetchDieselStats(network?: string): Promise<{
  dieselTotalSupply: bigint;
  pools: {
    DIESEL_FRBTC: { reserve0: bigint; reserve1: bigint; lpSupply: bigint } | null;
    DIESEL_BUSD: { reserve0: bigint; reserve1: bigint; lpSupply: bigint } | null;
  };
  height: number;
}> {
  try {
    const client = getAlkanesClient(network);
    const luaResult = await client.executeLuaScript<StatsLuaResult>(
      STATS_LUA_SCRIPT,
      [[]]
    );

    return {
      dieselTotalSupply: BigInt(Math.floor(luaResult?.diesel?.total_supply || 0)),
      pools: {
        DIESEL_FRBTC: luaResult?.pools?.DIESEL_FRBTC ? {
          reserve0: BigInt(Math.floor(luaResult.pools.DIESEL_FRBTC.reserve_a)),
          reserve1: BigInt(Math.floor(luaResult.pools.DIESEL_FRBTC.reserve_b)),
          lpSupply: BigInt(Math.floor(luaResult.pools.DIESEL_FRBTC.total_supply)),
        } : null,
        DIESEL_BUSD: luaResult?.pools?.DIESEL_BUSD ? {
          reserve0: BigInt(Math.floor(luaResult.pools.DIESEL_BUSD.reserve_a)),
          reserve1: BigInt(Math.floor(luaResult.pools.DIESEL_BUSD.reserve_b)),
          lpSupply: BigInt(Math.floor(luaResult.pools.DIESEL_BUSD.total_supply)),
        } : null,
      },
      height: luaResult?.height || 0,
    };
  } catch (error) {
    console.error('[CandleFetcher] Error fetching DIESEL stats:', error);
    return {
      dieselTotalSupply: BigInt(0),
      pools: { DIESEL_FRBTC: null, DIESEL_BUSD: null },
      height: 0,
    };
  }
}
