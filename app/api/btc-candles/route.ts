import { NextResponse } from 'next/server';
import { SUBFROST_API_URLS } from '@/utils/getConfig';

export const dynamic = 'force-dynamic';

/**
 * GET /api/btc-candles
 * Returns BTC/USDT candlestick data via subpricer (falls back to Binance)
 *
 * Query params:
 * - interval: '1h' | '4h' | '1d' | '1w' (default: '1d')
 * - limit: number of candles (default: 100, max: 500)
 * - network: mainnet | regtest | ... (default: mainnet)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const interval = searchParams.get('interval') || '1d';
  const limit = Math.min(Number(searchParams.get('limit')) || 100, 500);
  const network = searchParams.get('network') || 'mainnet';
  const baseUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;

  try {
    // Primary: subpricer
    const response = await fetch(
      `${baseUrl}/api/v1/bitcoin-candles?interval=${interval}&limit=${limit}`,
      { next: { revalidate: 60 } }
    );

    if (response.ok) {
      const data = await response.json();
      // subpricer returns [{open_time, open, high, low, close, volume, close_time}]
      const candles = (data || []).map((c: any) => ({
        timestamp: c.open_time || c.timestamp,
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
        volume: parseFloat(c.volume),
      }));

      return NextResponse.json({ symbol: 'BTC/USDT', interval, candles }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
      });
    }
  } catch { /* fall through */ }

  // Fallback: Binance directly
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${interval}&limit=${limit}`,
      { next: { revalidate: 60 } }
    );
    if (!response.ok) throw new Error(`Binance ${response.status}`);
    const klines = await response.json();
    const candles = klines.map((k: (string | number)[]) => ({
      timestamp: Number(k[0]),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }));
    return NextResponse.json({ symbol: 'BTC/USDT', interval, candles }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    });
  } catch (error) {
    return NextResponse.json({
      symbol: 'BTC/USDT', interval, candles: [],
      error: error instanceof Error ? error.message : 'Failed to fetch candles',
    }, { status: 500 });
  }
}
