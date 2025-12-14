import { NextRequest, NextResponse } from 'next/server';
import {
  getPoolVolume,
  getAllPoolVolumes,
  getPools,
} from '@/lib/pools/pool-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pools/volume
 *
 * Query params:
 *   - pool: pool key (e.g., 'DIESEL_FRBTC') or 'all'
 *   - network: network name (e.g., 'mainnet', 'regtest')
 *
 * Returns 24h trading volume for pools
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolParam = searchParams.get('pool') || 'all';
    const network = searchParams.get('network') || undefined;

    const pools = getPools(network);

    // All pool volumes
    if (poolParam === 'all') {
      const allVolumes = await getAllPoolVolumes(network);

      return NextResponse.json({
        success: true,
        data: allVolumes,
      });
    }

    // Validate pool key
    if (!pools[poolParam]) {
      return NextResponse.json(
        { success: false, error: `Invalid pool: ${poolParam}` },
        { status: 400 }
      );
    }

    // Single pool volume
    const volume = await getPoolVolume(poolParam, network);
    if (!volume) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch volume for ${poolParam}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: volume,
    });
  } catch (error) {
    console.error('[API /pools/volume] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
