/**
 * Token Names API — Proxies the data API's /get-alkanes endpoint
 *
 * GET /api/token-names?network=<network>&limit=<limit>
 *
 * Returns a map of alkaneId → { name, symbol } for the top N tokens.
 * This proxy avoids CORS issues when fetching directly from subfrost API.
 *
 * ## Env-configurable Espo upstreams (mainnet only)
 *
 * Both default to sensible values, override only when ops needs to flip
 * the active deployment without a code change. Examples:
 *
 *   ESPO_MAINNET_PRIMARY_URL   — primary base URL for /get-alkanes.
 *                                Default: https://mainnet.subfrost.io/v4/subfrost
 *                                Set to https://oyl.alkanode.com to use
 *                                alkanode as primary while subfrost's
 *                                hosted Espo is down.
 *   ESPO_MAINNET_FALLBACK_URL  — fallback used when the primary returns
 *                                non-2xx / times out. Default:
 *                                https://oyl.alkanode.com
 *                                Set empty string to disable fallback.
 *
 * Non-mainnet networks (testnet/signet/regtest/etc) ignore these vars
 * since alkanode only hosts a mainnet Espo deployment.
 */

import { NextResponse } from 'next/server';

const SUBFROST_MAINNET = 'https://mainnet.subfrost.io/v4/subfrost';
const ALKANODE_OYL_MAINNET = 'https://oyl.alkanode.com';

const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: process.env.ESPO_MAINNET_PRIMARY_URL || SUBFROST_MAINNET,
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
  devnet: 'http://localhost:18888', // In-browser only
};

// Fallback Espo deployments hosted by alkanode — same OYL module + same REST
// shape, so when the primary subfrost gateway has an Espo outage (verified
// 2026-05-08, espo dev confirmed it's a Subfrost-side ops issue), the proxy
// can degrade to this without any consumer-visible change. Mainnet only —
// alkanode does not host testnet/signet/regtest Espo deployments.
//
// `ESPO_MAINNET_FALLBACK_URL=""` disables fallback entirely (single-upstream
// mode). Any other value overrides the default alkanode URL.
const fallbackEnv = process.env.ESPO_MAINNET_FALLBACK_URL;
const FALLBACK_BASE_URLS: Record<string, string> = {};
if (fallbackEnv === undefined) {
  FALLBACK_BASE_URLS.mainnet = ALKANODE_OYL_MAINNET;
} else if (fallbackEnv.length > 0) {
  FALLBACK_BASE_URLS.mainnet = fallbackEnv;
}
// fallbackEnv === '' → no mainnet fallback (intentional opt-out)

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
  const fallbackBase = FALLBACK_BASE_URLS[network];

  // Try primary; if it 502s / times out / errors, try the alkanode-hosted
  // Espo as a fallback. Both expose the same `/get-alkanes` REST contract.
  const fetchAlkanes = async (base: string) => {
    const resp = await fetch(`${base}/get-alkanes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, offset: 0 }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!resp.ok) {
      throw new Error(`Data API failed: ${resp.status} (${base})`);
    }
    return resp;
  };

  try {
    let response: Response;
    try {
      response = await fetchAlkanes(baseUrl);
    } catch (primaryErr) {
      if (!fallbackBase) throw primaryErr;
      console.warn(`[token-names] primary upstream failed (${primaryErr instanceof Error ? primaryErr.message : 'unknown'}); falling back to ${fallbackBase}`);
      response = await fetchAlkanes(fallbackBase);
    }

    const data = await response.json();
    const tokens: any[] = data?.data?.tokens || [];

    // Build name map AND a parallel price map. Espo's /get-alkanes
    // returns priceUsd / busdPoolPriceInUsd / priceInSatoshi per token
    // (same fields as /get-alkanes-by-address). Without this, the swap
    // UI's USD-equivalent display falls through to derived-from-pool-TVL
    // and shows $0.00 whenever the user doesn't already hold the token
    // and the pools query hasn't populated TVL yet.
    //
    // frBTC special-case: espo derives priceUsd from the bUSD/frBTC pool
    // which isn't peg-arbitraged, so its implied price drifts from BTC.
    // Skip it here and let consumers fall back to the live BTC price.
    const names: Record<string, { name: string; symbol: string }> = {};
    const prices: Record<string, { priceUsd?: number; priceInSatoshi?: number }> = {};
    for (const token of tokens) {
      const block = token.id?.block ?? 0;
      const tx = token.id?.tx ?? 0;
      const alkaneId = `${block}:${tx}`;
      if (!alkaneId) continue;
      if (token.name || token.symbol) {
        names[alkaneId] = { name: token.name || '', symbol: token.symbol || '' };
      }
      const isFrbtc = alkaneId === '32:0';
      const rawUsd = isFrbtc ? undefined : (token.priceUsd ?? token.busdPoolPriceInUsd);
      const rawSats = token.priceInSatoshi;
      const priceUsd = typeof rawUsd === 'number' && rawUsd > 0
        ? rawUsd
        : (typeof rawUsd === 'string' && Number(rawUsd) > 0 ? Number(rawUsd) : undefined);
      const priceInSatoshi = typeof rawSats === 'number' && rawSats > 0
        ? rawSats
        : (typeof rawSats === 'string' && Number(rawSats) > 0 ? Number(rawSats) : undefined);
      if (priceUsd !== undefined || priceInSatoshi !== undefined) {
        prices[alkaneId] = { priceUsd, priceInSatoshi };
      }
    }

    const payload = { names, prices, count: Object.keys(names).length };
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
