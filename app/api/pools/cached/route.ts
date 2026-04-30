import { NextResponse } from 'next/server';
import { SUBFROST_API_URLS, getConfig } from '@/utils/getConfig';

type CacheEntry = { data: any; timestamp: number };

const fresh = new Map<string, CacheEntry>();
const lastGood = new Map<string, CacheEntry>();

const FRESH_TTL = 30_000;
const STALE_TTL = 5 * 60_000;
const UPSTREAM_TIMEOUT_MS = 8_000;

const FRESH_CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=300';
const STALE_CACHE_HEADER = 'public, s-maxage=10, stale-while-revalidate=60';

function getFactoryIdParts(network: string): { block: string; tx: string } {
  const cfg = getConfig(network) as { ALKANE_FACTORY_ID?: string };
  const id = cfg.ALKANE_FACTORY_ID || '4:65522';
  const [block, tx] = id.split(':');
  return { block, tx };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network') || 'mainnet';
  const now = Date.now();

  const f = fresh.get(network);
  if (f && now - f.timestamp < FRESH_TTL) {
    return NextResponse.json(f.data, {
      headers: { 'Cache-Control': FRESH_CACHE_HEADER, 'x-cache': 'hit' },
    });
  }

  const baseUrl = SUBFROST_API_URLS[network];
  if (!baseUrl) {
    return NextResponse.json({ error: `unknown network ${network}` }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${baseUrl}/get-all-pools-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factoryId: getFactoryIdParts(network) }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      throw new Error(`upstream ${upstream.status}`);
    }

    const data = await upstream.json();
    const entry: CacheEntry = { data, timestamp: now };
    fresh.set(network, entry);
    lastGood.set(network, entry);

    return NextResponse.json(data, {
      headers: { 'Cache-Control': FRESH_CACHE_HEADER, 'x-cache': 'miss' },
    });
  } catch (e: any) {
    const stale = lastGood.get(network);
    if (stale && now - stale.timestamp < STALE_TTL) {
      return NextResponse.json(stale.data, {
        headers: {
          'Cache-Control': STALE_CACHE_HEADER,
          'x-cache': 'stale',
          'x-cache-error': String(e?.message || 'fetch failed').slice(0, 200),
        },
      });
    }
    return NextResponse.json({ error: e?.message || 'fetch failed' }, { status: 502 });
  }
}
