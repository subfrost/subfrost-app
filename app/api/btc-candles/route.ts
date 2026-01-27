import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Binance kline intervals
type BinanceInterval = '1h' | '4h' | '1d' | '1w';

const INTERVAL_MAP: Record<string, BinanceInterval> = {
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
};

/**
 * GET /api/btc-candles
 * Returns BTC/USDT candlestick data from Binance
 *
 * Query params:
 * - interval: '1h' | '4h' | '1d' | '1w' (default: '1d')
 * - limit: number of candles (default: 100, max: 500)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const interval = INTERVAL_MAP[searchParams.get('interval') || '1d'] || '1d';
    const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);

    // Fetch from Binance public API (no auth required)
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        next: { revalidate: 60 }, // Cache for 1 minute
      }
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const klines = await response.json();

    // Transform Binance kline format to our candle format
    // Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
    const candles = klines.map((k: (string | number)[]) => ({
      timestamp: Number(k[0]), // openTime in ms
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));

    return NextResponse.json({
      symbol: 'BTC/USDT',
      interval,
      candles,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('[API /btc-candles] Error:', error);
    return NextResponse.json({
      symbol: 'BTC/USDT',
      interval: '1d',
      candles: [],
      error: error instanceof Error ? error.message : 'Failed to fetch BTC candles',
    }, { status: 500 });
  }
}
