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

// Mainnet upstream: canon Espo on alkanode. Per flex (alkanes-rs maintainer,
// 2026-05-10): "All of the /v4/subfrost/* routes other than BTC pricing are
// espo routes. They should be bypassed and go directly to espo." We do not
// keep a subfrost.io fallback because subfrost.io is the reverse proxy this
// route is bypassing — falling back to it would re-introduce the broken
// path (verified 2026-05-10: /v4/subfrost/get-alkane-details returns 404
// alkane_not_found for known mainnet alkanes; /v4/subfrost/get-all-pools-details
// returns total:0 during indexer drift).
//
// Override with ESPO_MAINNET_PRIMARY_URL if alkanode itself goes down.
const ALKANODE_OYL_MAINNET = 'https://oyl.alkanode.com';
const ESPO_BASE_URLS: Record<string, string> = {};
const primaryEnv = process.env.ESPO_MAINNET_PRIMARY_URL;
ESPO_BASE_URLS.mainnet = primaryEnv && primaryEnv.length > 0
  ? primaryEnv
  : ALKANODE_OYL_MAINNET;

function getFactoryIdParts(network: string): { block: string; tx: string } {
  const cfg = getConfig(network) as { ALKANE_FACTORY_ID?: string };
  const id = cfg.ALKANE_FACTORY_ID || '4:65522';
  const [block, tx] = id.split(':');
  return { block, tx };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const network = searchParams.get('network') || 'mainnet';

  // On mainnet: canon alkanode is the only upstream.
  // On other networks: subfrost.io is the only available espo deployment.
  const baseUrl = ESPO_BASE_URLS[network] || SUBFROST_API_URLS[network];
  if (!baseUrl) {
    return NextResponse.json({ error: `unknown network ${network}` }, { status: 400 });
  }

  const factoryParts = getFactoryIdParts(network);

  try {
    const resp = await fetch(`${baseUrl}/get-all-pools-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factoryId: factoryParts }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: `upstream ${resp.status} (${baseUrl})` },
        { status: 502 },
      );
    }
    const data = await resp.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': FRESH_CACHE_HEADER },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'fetch failed' },
      { status: 502 },
    );
  }
}
