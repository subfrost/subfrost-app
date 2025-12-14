import { NextRequest, NextResponse } from 'next/server';
import {
  getPoolStats,
  getAllPoolStats,
  getDashboardStats,
  getPools,
} from '@/lib/pools/pool-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pools/stats
 *
 * Query params:
 *   - pool: pool key (e.g., 'DIESEL_FRBTC') or 'all'
 *   - dashboard: if 'true', returns full dashboard stats
 *   - network: network name (e.g., 'mainnet', 'regtest')
 *
 * Returns pool stats including TVL, volume, APR
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolParam = searchParams.get('pool') || 'all';
    const dashboardParam = searchParams.get('dashboard');
    const network = searchParams.get('network') || undefined;

    // Dashboard stats (combined)
    if (dashboardParam === 'true') {
      const dashboardStats = await getDashboardStats(network);

      // Serialize bigints for JSON response
      const serializedPools: Record<string, any> = {};
      for (const [key, stats] of Object.entries(dashboardStats.pools)) {
        serializedPools[key] = {
          ...stats,
          reserve0: stats.reserve0.toString(),
          reserve1: stats.reserve1.toString(),
          lpTotalSupply: stats.lpTotalSupply.toString(),
        };
      }

      const serializedTvlPools: Record<string, any> = {};
      for (const [key, pool] of Object.entries(dashboardStats.tvlStats.pools)) {
        serializedTvlPools[key] = {
          ...pool,
          reserve0: pool.reserve0.toString(),
          reserve1: pool.reserve1.toString(),
          lpTotalSupply: pool.lpTotalSupply.toString(),
        };
      }

      return NextResponse.json({
        success: true,
        data: {
          marketStats: {
            ...dashboardStats.marketStats,
            totalSupply: dashboardStats.marketStats.totalSupply.toString(),
          },
          tvlStats: {
            ...dashboardStats.tvlStats,
            pools: serializedTvlPools,
          },
          btcPrice: dashboardStats.btcPrice,
          pools: serializedPools,
          timestamp: dashboardStats.timestamp,
        },
      });
    }

    const pools = getPools(network);

    // All pool stats
    if (poolParam === 'all') {
      const allStats = await getAllPoolStats(network);

      // Serialize bigints
      const serializedStats: Record<string, any> = {};
      for (const [key, stats] of Object.entries(allStats)) {
        serializedStats[key] = {
          ...stats,
          reserve0: stats.reserve0.toString(),
          reserve1: stats.reserve1.toString(),
          lpTotalSupply: stats.lpTotalSupply.toString(),
        };
      }

      return NextResponse.json({
        success: true,
        data: serializedStats,
      });
    }

    // Validate pool key
    if (!pools[poolParam]) {
      return NextResponse.json(
        { success: false, error: `Invalid pool: ${poolParam}` },
        { status: 400 }
      );
    }

    // Single pool stats
    const stats = await getPoolStats(poolParam, network);
    if (!stats) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch stats for ${poolParam}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...stats,
        reserve0: stats.reserve0.toString(),
        reserve1: stats.reserve1.toString(),
        lpTotalSupply: stats.lpTotalSupply.toString(),
      },
    });
  } catch (error) {
    console.error('[API /pools/stats] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
