import { NextResponse } from 'next/server';

export const revalidate = 30; // seconds

// Default fallback fees
const DEFAULT_FEES = { slow: 2, medium: 8, fast: 25 };

export async function GET() {
  // Create an AbortController with timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const res = await fetch('https://mempool.space/api/v1/fees/recommended', {
      signal: controller.signal,
      // cache at edge for a short time
      next: { revalidate },
    });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error('Failed to fetch mempool fees');
    const json = await res.json();
    const mapped = {
      slow: Number(json.hourFee ?? 2),
      medium: Number(json.halfHourFee ?? 8),
      fast: Number(json.fastestFee ?? 25),
    };
    return NextResponse.json(mapped, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch {
    clearTimeout(timeoutId);
    // Return defaults on timeout or error
    return NextResponse.json(DEFAULT_FEES, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
      },
    });
  }
}


