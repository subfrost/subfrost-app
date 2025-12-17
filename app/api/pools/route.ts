import { NextRequest, NextResponse } from 'next/server';
import {
  getPools,
  getPoolReserves,
  getPoolPrice,
  getAllPoolPrices,
  getCurrentBlockHeight,
} from '@/lib/pools/pool-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pools
 *
 * Query params:
 *   - pool: pool key (e.g., 'DIESEL_FRBTC') or 'all'
 *   - height: block height (optional, defaults to latest)
 *
 * Returns pool prices and reserves
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolParam = searchParams.get('pool') || 'all';
    const heightParam = searchParams.get('height');
    const network = searchParams.get('network') || undefined;

    const pools = getPools(network);

    if (poolParam === 'all') {
      const [allPrices, currentHeight] = await Promise.all([
        getAllPoolPrices(network),
        getCurrentBlockHeight(network),
      ]);

      // Serialize bigints
      const serializedPools: Record<string, any> = {};
      for (const [key, price] of Object.entries(allPrices)) {
        serializedPools[key] = {
          ...price,
          reserve0: price.reserve0.toString(),
          reserve1: price.reserve1.toString(),
        };
      }

      return NextResponse.json({
        success: true,
        data: {
          currentHeight,
          pools: serializedPools,
        },
      });
    }

    // Validate pool key
    if (!pools[poolParam]) {
      return NextResponse.json(
        { success: false, error: `Invalid pool: ${poolParam}` },
        { status: 400 }
      );
    }

    if (heightParam) {
      // Get reserves at specific height (not cached)
      const reserves = await getPoolReserves(poolParam, network);
      if (!reserves) {
        return NextResponse.json(
          { success: false, error: `Failed to fetch reserves for ${poolParam}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          ...reserves,
          reserve0: reserves.reserve0.toString(),
          reserve1: reserves.reserve1.toString(),
          totalSupply: reserves.totalSupply.toString(),
        },
      });
    }

    // Get current price
    const price = await getPoolPrice(poolParam, network);
    if (!price) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch price for ${poolParam}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...price,
        reserve0: price.reserve0.toString(),
        reserve1: price.reserve1.toString(),
      },
    });
  } catch (error) {
    console.error('[API /pools] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
