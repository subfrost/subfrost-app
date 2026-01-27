import { NextResponse } from 'next/server';
import { getBitcoinPrice } from '@/lib/pools/pool-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/btc-price
 * Returns the current Bitcoin price in USD
 *
 * This API route proxies the request server-side to avoid CORS issues
 * when the WASM SDK tries to fetch from mainnet.subfrost.io directly.
 */
export async function GET() {
  try {
    const priceData = await getBitcoinPrice();

    return NextResponse.json({
      usd: priceData.usd,
      timestamp: priceData.timestamp,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('[API /btc-price] Error:', error);
    // Return a fallback price of 0 on error
    return NextResponse.json({
      usd: 0,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Failed to fetch BTC price',
    }, { status: 500 });
  }
}
