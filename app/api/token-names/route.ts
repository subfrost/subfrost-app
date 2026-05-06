/**
 * Token Names API — Proxies the data API's /get-alkanes endpoint
 *
 * GET /api/token-names?network=<network>&limit=<limit>
 *
 * Returns a map of alkaneId → { name, symbol } for the top N tokens.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
 */

import { NextResponse } from 'next/server';

const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  devnet: 'http://localhost:18888', // In-browser only
};

/**
 * Well-known devnet token names — returned directly when network=devnet
 * since the devnet WASM runs in-browser and server-side can't reach it.
 */
const DEVNET_TOKEN_NAMES: Record<string, { name: string; symbol: string }> = {
  '2:0': { name: 'DIESEL', symbol: 'DIESEL' },
  '32:0': { name: 'frBTC', symbol: 'frBTC' },
  '4:256': { name: 'FIRE', symbol: 'FIRE' },
  '4:7000': { name: 'FUEL', symbol: 'FUEL' },
  '4:7010': { name: 'ftrBTC Template', symbol: 'ftrBTC' },
  '4:7020': { name: 'dxBTC Vault', symbol: 'dxBTC' },
  '4:7030': { name: 'vxFUEL Gauge', symbol: 'vxFUEL' },
  '4:7031': { name: 'vxBTCUSD Gauge', symbol: 'vxBTCUSD' },
  '4:8201': { name: 'frUSD', symbol: 'frUSD' },
  '4:65522': { name: 'AMM Factory', symbol: 'FACTORY' },
};

type CacheEntry = { data: any; timestamp: number };

const fresh = new Map<string, CacheEntry>();
const lastGood = new Map<string, CacheEntry>();

const FRESH_TTL = 5 * 60_000;       // 5 min — token names rarely change
const STALE_TTL = 60 * 60_000;      // 1 hr — serve stale on upstream failure
const UPSTREAM_TIMEOUT_MS = 10_000;

const FRESH_CACHE_HEADER = 'public, s-maxage=300, stale-while-revalidate=3600';
const STALE_CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=300';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const network = url.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
  const limit = Math.min(Number(url.searchParams.get('limit') || 500), 1000);

  // Devnet runs in-browser WASM — server can't reach it, return known tokens
  if (network === 'devnet' || network === 'regtest-local') {
    return NextResponse.json({ names: DEVNET_TOKEN_NAMES, count: Object.keys(DEVNET_TOKEN_NAMES).length });
  }

  const cacheKey = `${network}|${limit}`;
  const now = Date.now();

  const f = fresh.get(cacheKey);
  if (f && now - f.timestamp < FRESH_TTL) {
    return NextResponse.json(f.data, {
      headers: { 'Cache-Control': FRESH_CACHE_HEADER, 'x-cache': 'hit' },
    });
  }

  const baseUrl = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.mainnet;

  try {
    const response = await fetch(`${baseUrl}/get-alkanes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, offset: 0 }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Data API failed: ${response.status}`);
    }

    const data = await response.json();
    const tokens: any[] = data?.data?.tokens || [];

    // Build a flat map: alkaneId → { name, symbol }
    const names: Record<string, { name: string; symbol: string }> = {};
    for (const token of tokens) {
      const alkaneId = `${token.id?.block || 0}:${token.id?.tx || 0}`;
      if (alkaneId && (token.name || token.symbol)) {
        names[alkaneId] = { name: token.name || '', symbol: token.symbol || '' };
      }
    }

    const payload = { names, count: Object.keys(names).length };
    const entry: CacheEntry = { data: payload, timestamp: now };
    fresh.set(cacheKey, entry);
    lastGood.set(cacheKey, entry);

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': FRESH_CACHE_HEADER, 'x-cache': 'miss' },
    });
  } catch (error) {
    const stale = lastGood.get(cacheKey);
    if (stale && now - stale.timestamp < STALE_TTL) {
      return NextResponse.json(stale.data, {
        headers: {
          'Cache-Control': STALE_CACHE_HEADER,
          'x-cache': 'stale',
          'x-cache-error': String(error instanceof Error ? error.message : 'fetch failed').slice(0, 200),
        },
      });
    }
    console.error('[token-names] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch token names' },
      { status: 500 },
    );
  }
}
