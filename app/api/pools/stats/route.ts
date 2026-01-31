import { NextRequest, NextResponse } from 'next/server';
import { getConfig } from '@/utils/getConfig';

export const dynamic = 'force-dynamic';

// ============================================================================
// OYL Alkanode Types (subset of PoolDetailsResult)
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
  poolVolume30dInUsd?: number | string;
  poolApr?: number | string;
}

interface OylAllPoolsResponse {
  statusCode: number;
  data: {
    count: number;
    pools: OylPoolDetails[];
    total: number;
    totalTvl: number | string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function parseFactoryId(factoryIdStr: string): AlkaneId {
  const [block, tx] = factoryIdStr.split(':');
  return { block, tx };
}

function toNum(v: number | string | undefined | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** "DIESEL / frBTC" → "DIESEL_FRBTC" */
function poolNameToKey(name: string): string {
  return name
    .split('/')
    .map(s => s.trim().toUpperCase())
    .join('_');
}

/** "DIESEL / frBTC" → ["DIESEL", "frBTC"] */
function extractSymbols(name: string): [string, string] {
  const parts = name.split('/').map(s => s.trim());
  return [parts[0] || 'TOKEN0', parts[1] || 'TOKEN1'];
}

function mapPoolDetails(pool: OylPoolDetails): {
  key: string;
  stats: Record<string, unknown>;
} {
  const poolId = pool.poolId
    ? `${pool.poolId.block}:${pool.poolId.tx}`
    : `${pool.token0.block}:${pool.token0.tx}`;

  const [token0Symbol, token1Symbol] = extractSymbols(pool.poolName);

  const reserve0 = toNum(pool.token0Amount);
  const reserve1 = toNum(pool.token1Amount);
  const price = reserve0 > 0 ? reserve1 / reserve0 : 0;
  const priceInverse = reserve1 > 0 ? reserve0 / reserve1 : 0;

  const tvlUsd = toNum(pool.poolTvlInUsd);
  const tvlToken0 = toNum(pool.token0TvlInUsd);
  const tvlToken1 = toNum(pool.token1TvlInUsd);
  const volume24hUsd = toNum(pool.poolVolume1dInUsd);
  const volume30dUsd = toNum(pool.poolVolume30dInUsd);
  const apr = toNum(pool.poolApr);

  return {
    key: poolNameToKey(pool.poolName),
    stats: {
      poolId,
      poolName: pool.poolName,
      price,
      priceInverse,
      tvlUsd,
      tvlToken0,
      tvlToken1,
      volume24hUsd,
      volume30dUsd,
      apr,
      reserve0: pool.token0Amount || '0',
      reserve1: pool.token1Amount || '0',
      lpTotalSupply: pool.tokenSupply || '0',
      token0Symbol,
      token1Symbol,
      timestamp: Date.now(),
    },
  };
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * GET /api/pools/stats
 *
 * Query params:
 *   - pool: pool key (e.g., 'DIESEL_FRBTC') or 'all'
 *   - dashboard: if 'true', returns full dashboard stats
 *   - network: network name (e.g., 'mainnet', 'regtest')
 *
 * Fetches pool data from OYL Alkanode API (/get-all-pools-details).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolParam = searchParams.get('pool') || 'all';
    const dashboardParam = searchParams.get('dashboard');
    const network = searchParams.get('network') || 'mainnet';

    const config = getConfig(network);
    const alkanodeUrl = config.OYL_ALKANODE_URL;
    const factoryId = parseFactoryId(config.ALKANE_FACTORY_ID);

    // Fetch all pools from OYL Alkanode
    const response = await fetch(`${alkanodeUrl}/get-all-pools-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factoryId }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[API /pools/stats] OYL Alkanode error: ${response.status}`, text);
      return NextResponse.json(
        { success: false, error: `OYL Alkanode API error: ${response.status}` },
        { status: 502 },
      );
    }

    const json: OylAllPoolsResponse = await response.json();
    const pools = json?.data?.pools ?? [];

    // Map to PoolStats keyed by pool name
    const allStats: Record<string, Record<string, unknown>> = {};
    for (const pool of pools) {
      const { key, stats } = mapPoolDetails(pool);
      allStats[key] = stats;
    }

    // Dashboard stats
    if (dashboardParam === 'true') {
      const totalTvlUsd = toNum(json?.data?.totalTvl);

      return NextResponse.json({
        success: true,
        data: {
          marketStats: {
            totalSupply: '0',
            totalSupplyFormatted: 0,
            priceUsd: 0,
            priceBtc: 0,
            marketCapUsd: 0,
            timestamp: Date.now(),
          },
          tvlStats: {
            pools: allStats,
            totalTvlUsd,
            timestamp: Date.now(),
          },
          btcPrice: { usd: 0, timestamp: Date.now() },
          pools: allStats,
          timestamp: Date.now(),
        },
      });
    }

    // All pool stats
    if (poolParam === 'all') {
      return NextResponse.json({
        success: true,
        data: allStats,
      });
    }

    // Single pool stats
    const upperPoolParam = poolParam.toUpperCase();
    const singleStats = allStats[upperPoolParam];
    if (!singleStats) {
      return NextResponse.json(
        { success: false, error: `Pool not found: ${poolParam}` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: singleStats,
    });
  } catch (error) {
    console.error('[API /pools/stats] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
