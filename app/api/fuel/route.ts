/**
 * GET /api/fuel?address=X — Public endpoint for wallet FUEL allocation lookup.
 * Cached 60s via Redis.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';

const CACHE_TTL = 60;
const DEV_FUEL_ALLOCATIONS: Record<string, number> = {
  bc1p3692m0sd6nq5mv4uq0yz2laet3r0asw8kpkrdunkk8ddk045nxzsl2vdsq: 0.01,
  bc1prx42gsu83kxsg54nvw3edykuzdhh7vshm9hq4nkmkewmhtlv3stqhuqw3t: 0.01,
};

function parseFuelAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'object' && value !== null && 'amount' in value
    ? (value as { amount?: unknown }).amount
    : value;
  const amount = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function getDevFuelAllocation(address: string): number {
  if (process.env.NODE_ENV === 'production') return 0;
  return DEV_FUEL_ALLOCATIONS[address.toLowerCase()] ?? 0;
}

export async function GET(request: NextRequest) {
  let address = '';
  try {
    address = new URL(request.url).searchParams.get('address')?.trim() ?? '';
    if (!address) {
      return NextResponse.json({ error: 'address query param required' }, { status: 400 });
    }

    const cacheKey = `fuel:${address}`;
    const cached = await cache.get<unknown>(cacheKey);
    if (cached !== null) {
      const cachedAmount = parseFuelAmount(cached);
      if (cachedAmount !== null) {
        return NextResponse.json({ amount: cachedAmount }, {
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
      }
    }

    const allocation = await prisma.fuelAllocation.findUnique({
      where: { address },
      select: { amount: true },
    });

    const result = { amount: allocation?.amount ?? 0 };
    if (result.amount <= 0) {
      result.amount = getDevFuelAllocation(address);
    }
    await cache.set(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[API /fuel] Error:', error);
    return NextResponse.json({ amount: getDevFuelAllocation(address) }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  }
}
