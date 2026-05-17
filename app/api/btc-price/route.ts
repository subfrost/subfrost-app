import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/btc-price
 *
 * Same-origin proxy for the canonical subpricer endpoint
 * `https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price` (implemented
 * in `subkube`). The frontend calls this route; the route fetches subpricer
 * server-side. Reasons:
 *   - No CORS — the browser never talks to mainnet.subfrost.io directly.
 *   - CDN-edge cacheable (s-maxage below) so most page loads pay zero
 *     RPC round-trips.
 *   - Single canonical source — no fallback chain (CoinGecko / SDK
 *     dataApi removed 2026-05-14). If subpricer is unreachable, we
 *     return 0 and downstream USD displays render "—" rather than
 *     mixing stale numbers from a different aggregator.
 *
 * Response shape: `{ usd: number, timestamp: number }`.
 */
const SUBPRICER_URL = 'https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('network') === 'devnet') {
      return NextResponse.json({ usd: 100000, timestamp: Date.now() }, {
        headers: { 'Cache-Control': 'public, s-maxage=60' },
      });
    }
  } catch { /* ignore URL parse errors */ }

  try {
    const resp = await fetch(SUBPRICER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      throw new Error(`subpricer HTTP ${resp.status}`);
    }
    const data = await resp.json();
    // Subpricer envelope: { data: { bitcoin: { usd: number } }, statusCode: 200 }
    const usd = data?.data?.bitcoin?.usd ?? data?.usd ?? 0;
    if (typeof usd !== 'number' || usd <= 0) {
      throw new Error(`subpricer returned non-positive usd: ${usd}`);
    }
    return NextResponse.json({
      usd,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    console.error('[API /btc-price] Error:', error);
    return NextResponse.json({
      usd: 0,
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : 'Failed to fetch BTC price',
    }, { status: 502 });
  }
}
