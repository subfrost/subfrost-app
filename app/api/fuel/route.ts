/**
 * GET /api/fuel?address=X — Public endpoint for wallet FUEL allocation lookup.
 * Cached 60s via Redis.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

const CACHE_TTL = 60;

export async function GET(request: NextRequest) {
  try {
    const address = new URL(request.url).searchParams.get('address');
    if (!address) {
      return NextResponse.json({ error: 'address query param required' }, { status: 400 });
    }

    const cacheKey = `fuel:${address}`;
    const cached = await cache.get<{ amount: number }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const allocation = await prisma.fuelAllocation.findUnique({
      where: { address },
      select: { amount: true },
    });

    const result = { amount: allocation?.amount ?? 0 };
    await cache.set(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /fuel] Error:', error);
    return NextResponse.json({ amount: 0 });
  }
}
