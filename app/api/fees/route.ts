import { NextResponse } from 'next/server';

export const revalidate = 30; // seconds

export async function GET() {
  try {
    const res = await fetch('https://mempool.space/api/v1/fees/recommended', {
      // cache at edge for a short time
      next: { revalidate },
    });
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
    return NextResponse.json({ slow: 2, medium: 8, fast: 25 });
  }
}


