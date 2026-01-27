import { NextRequest, NextResponse } from 'next/server';
import {
  getPoolVolume,
  getAllPoolVolumes,
  getPools,
  type VolumePeriod,
} from '@/lib/pools/pool-service';

export const dynamic = 'force-dynamic';

/** Valid volume periods */
const VALID_PERIODS: VolumePeriod[] = ['24h', '7d', '30d'];

/**
 * GET /api/pools/volume
 *
 * Query params:
 *   - pool: pool key (e.g., 'DIESEL_FRBTC') or 'all'
 *   - period: time period ('24h', '7d', or '30d') - default: '24h'
 *   - network: network name (e.g., 'mainnet', 'regtest')
 *
 * Returns trading volume for pools over the specified period
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const poolParam = searchParams.get('pool') || 'all';
    const periodParam = searchParams.get('period') || '24h';
    const network = searchParams.get('network') || undefined;

    // Validate period
    if (!VALID_PERIODS.includes(periodParam as VolumePeriod)) {
      return NextResponse.json(
        { success: false, error: `Invalid period: ${periodParam}. Valid periods: ${VALID_PERIODS.join(', ')}` },
        { status: 400 }
      );
    }
    const period = periodParam as VolumePeriod;

    const pools = getPools(network);

    // All pool volumes
    if (poolParam === 'all') {
      const allVolumes = await getAllPoolVolumes(period, network);

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
    const volume = await getPoolVolume(poolParam, period, network);
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
