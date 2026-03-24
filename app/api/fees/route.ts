import { NextResponse } from 'next/server';

export const revalidate = 30; // seconds

// Pricing data is global — always use mainnet subpricer regardless of connected network
const SUBPRICER_BASE = 'https://mainnet.subfrost.io/v4/subfrost';

export async function GET() {
  try {
    const res = await fetch(`${SUBPRICER_BASE}/api/v1/bitcoin-fees`, {
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


