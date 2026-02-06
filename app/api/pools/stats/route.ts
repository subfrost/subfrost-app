import { NextRequest, NextResponse } from 'next/server';
import { getConfig, SUBFROST_API_URLS } from '@/utils/getConfig';

export const dynamic = 'force-dynamic';

// ============================================================================
// Types
// ============================================================================

interface PoolDetails {
  poolId?: { block: string; tx: string };
  poolName: string;
  token0: { block: string; tx: string };
  token1: { block: string; tx: string };
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

// ============================================================================
// Helpers
// ============================================================================

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

function mapPoolDetails(pool: PoolDetails): {
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
 * Fetches pool data from Subfrost OylAPI (same REST pattern as @alkanes/ts-sdk OylApiClient).
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolParam = searchParams.get('pool') || 'all';
    const dashboardParam = searchParams.get('dashboard');
    const network = searchParams.get('network') || 'mainnet';

    const config = getConfig(network);
    const apiUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;
    const [factoryBlock, factoryTx] = config.ALKANE_FACTORY_ID.split(':');

    // Fetch all pools via OylAPI REST endpoint (same pattern as @alkanes/ts-sdk OylApiClient)
    const response = await fetch(`${apiUrl}/get-all-pools-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factoryId: { block: factoryBlock, tx: factoryTx },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[API /pools/stats] Subfrost API error: ${response.status}`, text);
      return NextResponse.json(
        { success: false, error: `Subfrost API error: ${response.status}` },
        { status: 502 },
      );
    }

    const result = await response.json();
    const pools: PoolDetails[] = result?.data?.pools ?? result?.pools ?? [];
    const totalTvl = toNum(result?.data?.totalTvl ?? result?.totalTvl);

    // Map to PoolStats keyed by pool name
    const allStats: Record<string, Record<string, unknown>> = {};
    for (const pool of pools) {
      const { key, stats } = mapPoolDetails(pool);
      allStats[key] = stats;
    }

    // Dashboard stats
    if (dashboardParam === 'true') {
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
            totalTvlUsd: totalTvl,
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
