import { NextResponse } from 'next/server';
import { SUBFROST_API_URLS, getConfig } from '@/utils/getConfig';

const UPSTREAM_TIMEOUT_MS = 8_000;

// Vercel/CDN edge cache config:
//   s-maxage=30        — fresh for 30s on the CDN before re-checking origin
//   stale-while-revalidate=300 — serve stale up to 5 min while refreshing
//
// We deliberately do NOT keep an in-memory Map cache in this Node process.
// On serverless every cold-start instance gets its own empty Map, so the
// cache hit rate degrades fast under any traffic. Vercel CDN caches at edge
// for all instances and respects HeightPoller-driven client invalidation
// far better than a per-process map ever could.
const FRESH_CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=300';

function getFactoryIdParts(network: string): { block: string; tx: string } {
  const cfg = getConfig(network) as { ALKANE_FACTORY_ID?: string };
  const id = cfg.ALKANE_FACTORY_ID || '4:65522';
  const [block, tx] = id.split(':');
  return { block, tx };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network') || 'mainnet';

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
      return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }

    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': FRESH_CACHE_HEADER },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'fetch failed' }, { status: 502 });
  }
}
