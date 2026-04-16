import { NextResponse } from 'next/server';

const cacheMap = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30_000; // 30 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network') || 'mainnet';

  const cached = cacheMap.get(network);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    // Route through our own RPC proxy which handles network routing
    const baseUrl = request.url.split('/api/pools/')[0];
    const resp = await fetch(`${baseUrl}/api/rpc/${network}/get-all-pools-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        factoryId: { block: '4', tx: '65522' },
      }),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: `upstream ${resp.status}` }, { status: 502 });
    }

    const data = await resp.json();
    cacheMap.set(network, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'fetch failed' }, { status: 502 });
  }
}
