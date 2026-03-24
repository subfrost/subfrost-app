import { NextResponse } from 'next/server';
import { SUBFROST_API_URLS } from '@/utils/getConfig';

export const revalidate = 30; // seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network') || 'mainnet';
  const baseUrl = SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;

  try {
    // Primary: subpricer (co-deployed with jsonrpc at same base URL)
    const res = await fetch(`${baseUrl}/api/v1/bitcoin-fees`, {
      next: { revalidate },
    });
    if (res.ok) {
      const json = await res.json();
      const mapped = {
        slow: Number(json.economyFee ?? json.hourFee ?? 2),
        medium: Number(json.halfHourFee ?? 8),
        fast: Number(json.fastestFee ?? 25),
      };
      return NextResponse.json(mapped, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' },
      });
    }
  } catch { /* fall through to mempool.space */ }

  // Fallback: mempool.space directly
  try {
    const res = await fetch('https://mempool.space/api/v1/fees/recommended', {
      next: { revalidate },
    });
    if (!res.ok) throw new Error('mempool.space failed');
    const json = await res.json();
    return NextResponse.json({
      slow: Number(json.hourFee ?? 2),
      medium: Number(json.halfHourFee ?? 8),
      fast: Number(json.fastestFee ?? 25),
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json({ slow: 2, medium: 8, fast: 25 });
  }
}


