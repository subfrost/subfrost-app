/**
 * RPC Proxy Route — Bypasses CORS restrictions for browser-side RPC calls
 *
 * All requests are forwarded to the appropriate subfrost endpoint based on network.
 * Supports two URL patterns (single handler via optional catch-all):
 *
 *  1. Query-param: POST /api/rpc?network=mainnet          (direct callers)
 *  2. Path-based:  POST /api/rpc/mainnet                  (SDK JSON-RPC)
 *                  POST /api/rpc/mainnet/get-alkanes-by-address  (SDK REST)
 *
 * Pattern (2) exists because the WASM SDK uses `data_api_url` as a base and
 * appends REST sub-paths. Query-param URLs break when the SDK appends paths:
 *   /api/rpc?network=mainnet/get-alkanes-by-address  ← malformed
 *
 * JOURNAL ENTRY (2026-01-28): Created for CORS workaround.
 * JOURNAL ENTRY (2026-02-06): Consolidated into single optional catch-all.
 * JOURNAL ENTRY (2026-05-10, supersedes 2026-02-07): REST sub-paths route
 * to canon Espo on alkanode for mainnet (per flex: "All of the
 * /v4/subfrost/* routes other than BTC pricing are espo routes. They should
 * be bypassed and go directly to espo"). The earlier 2026-02-07 note saying
 * "all methods go to subfrost" no longer holds — see REST_PRIMARY_BASE_URLS
 * below.
 * JOURNAL ENTRY (2026-05-11 EVENING, supersedes earlier same-day notes):
 * Both `metashrew_view` AND `metashrew_height` route to /v6/subfrost on
 * mainnet, with an optional `Authorization: Bearer <SUBFROST_V6_API_KEY>`
 * header attached when that env var is set (server-side only — never
 * `NEXT_PUBLIC_*`). Background:
 *   - PR #117 routed both to /v6 to fix cross-replica drift.
 *   - PR #121 reverted height to /v4 because /v6's anonymous tier enforces
 *     a 20 req/min per-IP rate limit that Cloud Run's shared egress IP
 *     exhausts instantly. Swaps 429'd.
 *   - /v4 worked but exposed transient `metashrew-unwrap` and `error
 *     decoding response body` errors (~15% rate on the SDK's 500ms poll).
 *     Each error aborts the swap. Multiple in-flight retries can mask it
 *     but only at the cost of re-introducing the cross-endpoint fallback
 *     chains we just deleted.
 *   - This PR routes back to /v6 BUT signs requests with an authenticated
 *     API key. Authenticated /v6 calls bypass the anonymous rate bucket,
 *     and /v6's upstream is empirically more reliable than /v4's
 *     metashrew-unwrap path. Both swap-blocking failure modes go away.
 *
 * If SUBFROST_V6_API_KEY is unset (local dev without a key), /v6 calls
 * are sent unauthenticated and may 429 under load. Set the env var via
 * `.env.local` for local dev, or via Cloud Run env config for staging /
 * prod. Key is obtained from subfrost (api.subfrost.io signup).
 *
 * See pickEndpoint and buildHeadersForUrl below for the routing details.
 */

import { NextRequest, NextResponse } from 'next/server';

// All RPC endpoints point to subfrost infrastructure.
//
// JOURNAL ENTRY (2026-05-10): mainnet dual-routes by method.
// Per @flex: /v6/subfrost is JSON-RPC-only with sticky metashrew (perf),
// while /v4/subfrost handles legacy REST sub-paths + the rest of the
// JSON-RPC gateway (bitcoin RPC, alkanes_*, esplora_*).
//
// Routing matrix for mainnet:
//   - metashrew_view                          → /v6/subfrost (auth, sticky, fast)
//   - metashrew_height                        → /v6/subfrost (auth, sticky, fast)
//   - REST sub-paths (/get-all-amm-tx-history etc.) → alkanode (canon Espo)
//   - All other JSON-RPC                      → /v4/subfrost (gateway)
//
// /v6/subfrost benefit: 27-way parallel protorunesbyoutpoint fanout completes
// in ~0.18-0.29s wall time vs 0.92s on /v4/subfrost vs 8.7s on /v4/<token>.
// /v6 also avoids the `/v4` upstream's transient `metashrew-unwrap` and
// `error decoding response body` errors (verified 2026-05-11: ~15% error
// rate on /v4 metashrew_height under 500ms poll cadence; 0% on /v6).
//
// /v6's anonymous tier enforces a 20 req/min per-IP rate limit, which Cloud
// Run's shared egress IP exhausts instantly. Authenticated requests
// (Authorization header from SUBFROST_V6_API_KEY) bypass the bucket. See
// `buildHeadersForUrl` below.
//
// Other networks (testnet/signet/regtest) stay on /v4/<token> — only mainnet
// has the /v6 split.
const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  signet: 'https://signet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  regtest: 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  oylnet: 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
};

// Per-network metashrew-only endpoint override.
//
// 2026-05-11: emptied. Per flex (alkanes-rs maintainer) the load-balanced
// metashrew upgrades that previously only lived behind /v6/subfrost were
// rolled out to /v4/subfrost — so the entire RPC surface (alkanes_*,
// esplora_*, metashrew_view, metashrew_height) is now answered by /v4 with
// no flap. The /v6 anonymous tier still enforces a 20 req/min rate limit
// (which we used to side-step with SUBFROST_V6_API_KEY), and flex plans to
// remove /v6 entirely as redundant. Routing every method through one
// endpoint also avoids the cross-replica height-vs-view drift PR #117 was
// chasing.
//
// To re-enable a per-method metashrew split (e.g. if /v6 comes back as a
// dedicated CDN-fronted view-only tier), add `mainnet: '<url>'` back here.
const METASHREW_RPC_ENDPOINTS: Record<string, string | undefined> = {};

// Subfrost API key for /v6/subfrost authenticated requests. Read once at
// module load (not per-request) — the key doesn't change at runtime, and
// re-reading process.env on every request showed up in profiles. Server-
// side only — DO NOT expose this to the browser by adding NEXT_PUBLIC_*.
//
// When set, all requests to /v6/subfrost endpoints carry an
// `Authorization: Bearer <key>` header which (per subfrost docs at
// api.subfrost.io) bypasses the anonymous 20 req/min rate bucket.
// When unset, /v6 calls go out unauthenticated and may 429 under load.
//
// Local dev: put `SUBFROST_V6_API_KEY=...` in .env.local
// Staging/prod: configure as a Cloud Run env var
const SUBFROST_V6_API_KEY = process.env.SUBFROST_V6_API_KEY ?? '';

// Builds outbound headers for a given upstream URL. Always includes
// Content-Type. For /v6/subfrost endpoints, attaches the Authorization
// header when the API key is configured; everything else gets no auth.
//
// The "is /v6" check is URL-substring based (rather than coupling to
// METASHREW_RPC_ENDPOINTS lookup) so that custom upstreams pinned via
// future env vars also pick up auth automatically when they target /v6.
function buildHeadersForUrl(url: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (SUBFROST_V6_API_KEY && url.includes('/v6/subfrost')) {
    headers['Authorization'] = `Bearer ${SUBFROST_V6_API_KEY}`;
  }
  return headers;
}

// Batch JSON-RPC requests are more reliably handled by the explicit /jsonrpc path.
// Mainnet batches go through the gateway since they may contain mixed methods
// (a future enhancement could split batches by method, but isn't worth the
// complexity until profiling shows it matters).
const BATCH_RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/jsonrpc',
  signet: 'https://signet.subfrost.io/v4/jsonrpc',
  regtest: 'https://regtest.subfrost.io/v4/jsonrpc',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/jsonrpc',
  oylnet: 'https://regtest.subfrost.io/v4/jsonrpc',
};

// REST upstream for mainnet: canon Espo on alkanode. Per flex (alkanes-rs
// maintainer, 2026-05-10):
//   "All of the /v4/subfrost/* routes other than BTC pricing are espo routes.
//    They should be bypassed and go directly to espo."
//
// Subfrost.io's /v4/subfrost/* hosting was verified broken on 2026-05-10
// (404 alkane_not_found / 200-with-zero-pools for several REST endpoints),
// which is why landing-page surfaces (Trending Pair, Markets TVL) stopped
// showing real data on staging. We do NOT keep a subfrost.io fallback —
// falling back to it would re-introduce that broken path.
//
// Override env: ESPO_MAINNET_PRIMARY_URL — pin a different mainnet upstream
// (e.g. a backup alkanode mirror) if alkanode itself goes down.
//
// Note: this ONLY applies to REST sub-paths (e.g. /get-pool-details). The
// JSON-RPC routing (metashrew_view, alkanes_*, esplora_*, bitcoin_*) is a
// separate concern and stays on subfrost.io's gateway — see pickEndpoint
// below. Splitting JSON-RPC primary is out of scope here because alkanode
// hosts the espo REST contract but not the full subfrost JSON-RPC gateway.
const ALKANODE_OYL_MAINNET = 'https://oyl.alkanode.com';
const REST_PRIMARY_BASE_URLS: Record<string, string> = {};
const restPrimaryEnv = process.env.ESPO_MAINNET_PRIMARY_URL;
REST_PRIMARY_BASE_URLS.mainnet = restPrimaryEnv && restPrimaryEnv.length > 0
  ? restPrimaryEnv
  : ALKANODE_OYL_MAINNET;

function pickEndpoint(body: any, network: string) {
  const isBatch = Array.isArray(body);

  // Batch requests don't get method-level routing — they may contain mixed
  // methods, and splitting batches client-side is more complexity than the
  // perf delta justifies. Use the gateway endpoint for batches.
  if (isBatch) {
    return BATCH_RPC_ENDPOINTS[network] || BATCH_RPC_ENDPOINTS.regtest;
  }

  // Single requests: route both `metashrew_view` AND `metashrew_height`
  // to the network's metashrew endpoint when configured (currently /v6/
  // subfrost on mainnet, undefined elsewhere → falls through to gateway).
  //
  // /v6 wins on two axes:
  //   1. Speed: ~70ms p50 vs ~250ms on /v4, plus sticky-replica behavior
  //      that avoids cross-replica drift between height and view calls.
  //   2. Reliability: /v4's metashrew-unwrap upstream is ~15% flaky on
  //      the SDK's 500ms height poll cadence (verified live 2026-05-11
  //      via 20-call burst tests). /v6 returned 0/20 errors in the same
  //      test. Each /v4 error aborts the swap — so the seemingly-rare
  //      flake hits ~95% of swap attempts in practice (60 polls × 15%).
  //
  // /v6's anonymous tier has a 20 req/min per-IP rate limit. We dodge it
  // by signing requests with SUBFROST_V6_API_KEY in `buildHeadersForUrl`
  // (server-side env var, never exposed to browsers). Without the key,
  // /v6 calls go out unauthenticated and may 429 under load — the user
  // (or ops) is responsible for setting the env var before deploying to
  // shared-IP environments like Cloud Run.
  //
  // Other JSON-RPC (alkanes_*, bitcoin_*, esplora_*) and REST sub-paths
  // continue to route through the /v4 gateway and alkanode respectively.
  const method = typeof body?.method === 'string' ? body.method : '';
  const isMetashrewMethod = method === 'metashrew_view' || method === 'metashrew_height';
  const metashrewUrl = METASHREW_RPC_ENDPOINTS[network];
  if (isMetashrewMethod && metashrewUrl) {
    return metashrewUrl;
  }

  return RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ segments?: string[] }> }
) {
  try {
    const { segments } = await params;
    const body = await request.json();

    let network: string;
    let targetUrl: string;

    // Qubitcoin-regtest service URLs (VPN-only, from env)
    const QBC_HOST = process.env.QUBITCOIN_REGTEST_HOST || '127.0.0.1';
    const QBC_LOCAL = QBC_HOST === '127.0.0.1' || QBC_HOST === 'localhost';
    // Local qubitcoind: all services on single port 19443 (built-in indexers)
    // Remote k3s: separate services on NodePorts
    const QBC_METASHREW = QBC_LOCAL ? `http://${QBC_HOST}:19443` : `http://${QBC_HOST}:31080`;
    const QBC_ESPLORA = QBC_LOCAL ? `http://${QBC_HOST}:19443` : `http://${QBC_HOST}:31050`;
    const QBC_JSONRPC = QBC_LOCAL ? `http://${QBC_HOST}:19443` : `http://${QBC_HOST}:31944`;
    const QBC_ESPO = QBC_LOCAL ? `http://${QBC_HOST}:31578` : `http://${QBC_HOST}:31578`;

    if (segments && segments.length > 0) {
      // Path-based: /api/rpc/mainnet  or  /api/rpc/mainnet/get-alkanes-by-address
      const [networkSegment, ...restPath] = segments;
      network = networkSegment;

      if (restPath.length > 0) {
        if (networkSegment === 'qubitcoin-regtest') {
          // Route /espo sub-path to espo JSON-RPC on server
          if (restPath[0] === 'espo') {
            const espoUrl = QBC_ESPO + '/rpc';
            console.log(`[RPC Proxy] qubitcoin-regtest /espo → ${espoUrl}`);
            try {
              const espoBody = await request.clone().json().catch(() => ({}));
              const espoResp = await fetch(espoUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(espoBody),
              });
              const espoData = await espoResp.json();
              return NextResponse.json(espoData);
            } catch (e) {
              console.log(`[RPC Proxy] qubitcoin-regtest /espo failed:`, e);
              return NextResponse.json({ jsonrpc: '2.0', error: { code: -32603, message: 'espo unavailable' }, id: null });
            }
          }
          // /get-block-height → fetch from metashrew
          if (restPath[0] === 'get-block-height') {
            try {
              const hResp = await fetch(QBC_METASHREW, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_height', params: [], id: 1 }),
              });
              const hData = await hResp.json();
              const height = parseInt(hData.result, 10) || 0;
              console.log(`[RPC Proxy] qubitcoin-regtest /get-block-height → ${height}`);
              return NextResponse.json({ height });
            } catch {
              return NextResponse.json({ height: 0 });
            }
          }
          // Other REST sub-paths — return empty for SDK fallback
          console.log(`[RPC Proxy] qubitcoin-regtest REST /${restPath.join('/')} → empty (no data API)`);
          return NextResponse.json({ statusCode: 200, data: [] });
        }
        // REST sub-path: forward to canon Espo (alkanode on mainnet, per
        // flex 2026-05-10). NO subfrost.io fallback — falling back would
        // re-introduce the broken /v4/subfrost/* path this proxy exists to
        // bypass. For non-mainnet networks the primary stays on
        // subfrost.io because alkanode hosts a mainnet espo deployment
        // only.
        const restPrimary = REST_PRIMARY_BASE_URLS[network]
          || RPC_ENDPOINTS[network]
          || RPC_ENDPOINTS.regtest;
        const baseUrl = restPrimary.replace(/\/$/, '');
        targetUrl = `${baseUrl}/${restPath.join('/')}`;
      } else {
        // Plain JSON-RPC
        targetUrl = pickEndpoint(body, network);
      }
    } else {
      // Query-param: /api/rpc?network=mainnet  (existing direct callers)
      network = request.nextUrl.searchParams.get('network') || process.env.NEXT_PUBLIC_NETWORK || 'regtest';
      targetUrl = pickEndpoint(body, network);
    }

    // Devnet runs in-browser only — server-side API routes can't reach it.
    // regtest-local is a real Docker stack at localhost:18888 — DO NOT block it here.
    if (network === 'devnet') {
      return NextResponse.json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Devnet is in-browser only; use fetch interceptor' },
        id: body?.id ?? null,
      }, { status: 503 });
    }

    // Qubitcoin-regtest: route methods to the correct service on the remote server.
    //   :31944 — qubitcoin-jsonrpc (bitcoin RPC + secondaryview/secondaryheight)
    //   :31080 — metashrew/rockshrew (metashrew_view, metashrew_height)
    //   :31050 — esplora (REST block explorer)
    //   :31443 — bitcoind (raw bitcoin RPC)
    if (network === 'qubitcoin-regtest' && !Array.isArray(body)) {
      const m = body.method || '';

      // Esplora methods → esplora REST service
      if (m.startsWith('esplora_')) {
        // Convert esplora_address::utxo → /address/{addr}/utxo REST call
        const esploraBase = QBC_ESPLORA;
        const params = body.params || [];

        let esploraPath = '';
        if (m === 'esplora_address::utxo' && params[0]) {
          esploraPath = `/address/${params[0]}/utxo`;
        } else if (m === 'esplora_address::txs:mempool' && params[0]) {
          esploraPath = `/address/${params[0]}/txs/mempool`;
        } else if (m === 'esplora_tx' && params[0]) {
          esploraPath = `/tx/${params[0]}`;
        }

        if (esploraPath) {
          console.log(`[RPC Proxy] ${m} -> ${esploraBase}${esploraPath}`);
          try {
            const esploraResp = await fetch(`${esploraBase}${esploraPath}`);
            const esploraData = await esploraResp.json();
            return NextResponse.json({ jsonrpc: '2.0', result: esploraData, id: body.id ?? 1 });
          } catch (e) {
            return NextResponse.json({ jsonrpc: '2.0', result: [], id: body.id ?? 1 });
          }
        }
      }

      // metashrew methods → metashrew service directly (supports all view functions)
      if (m === 'metashrew_view' || m === 'metashrew_height') {
        targetUrl = QBC_METASHREW;
      }
      // Lua methods → metashrew (it handles lua_evalscript/lua_evalsaved)
      else if (m.startsWith('lua_')) {
        targetUrl = QBC_METASHREW;
      }
      // Bitcoin RPC methods → qubitcoin-jsonrpc
      else if (['getblockcount', 'getblockhash', 'getblock', 'getrawtransaction',
                 'sendrawtransaction', 'generatetoaddress', 'getrawmempool',
                 'gettxout', 'getmempoolinfo'].includes(m)) {
        if (m === 'sendrawtransaction') {
          console.log(`[RPC Proxy] sendrawtransaction: ${body.params?.[0]?.length || 0} hex chars, params: ${body.params?.length}`);
        }
        targetUrl = QBC_JSONRPC;
      }
      // ord methods → not available, return empty
      else if (m.startsWith('ord_')) {
        return NextResponse.json({ jsonrpc: '2.0', result: { indexed: false, inscriptions: [], runes: {} }, id: body.id ?? 1 });
      }
      // alkanes_ prefixed → translate to secondaryview on qubitcoin
      else if (m.startsWith('alkanes_')) {
        const viewName = m.replace('alkanes_', '');
        body.method = 'secondaryview';
        body.params = ['alkanes', viewName, ...(body.params || [])];
        targetUrl = QBC_JSONRPC;
      }
      // Default → qubitcoin-jsonrpc
      else {
        targetUrl = QBC_JSONRPC;
      }
    }

    // Log for debugging
    const method = Array.isArray(body) ? 'batch' : body?.method;
    console.log(`[RPC Proxy] ${method} -> ${targetUrl}`);

    // Single upstream, no fallbacks. Per flex 2026-05-11: "OK lets remove
    // all fallbacks everywhere. We should never have more than 1 way to do
    // something." This used to carry four fallback chains: a metashrew /v6
    // → /v4-gateway retry on non-JSON, a metashrew-unwrap → /v4/jsonrpc
    // retry, a metashrew /v6 → /v4-gateway retry on rate-limit / JSON-RPC
    // error, and a 2-attempt server-side retry for alkanes_*. All deleted
    // because:
    //
    //   1. The "metashrew-unwrap" routing error on /v4/<token> motivated
    //      the JSON-RPC fallback. Today (PR #117) `metashrew_height` and
    //      `metashrew_view` both route to /v6 which doesn't have that
    //      error class. The /v4 unwrap failure mode is no longer reachable
    //      from this proxy.
    //   2. The /v6 rate-limit fallback assumed /v6 would 429 the SDK's
    //      500ms poll. Re-verified 2026-05-11: 8/8 requests succeeded at
    //      that cadence, no 429. Whatever rate-limit window /v6 used to
    //      enforce is gone or raised.
    //   3. The alkanes_* server-side retry was masking transient subfrost
    //      flakes that the client-side cache (with Promise.allSettled in
    //      queries/account.ts:walletUtxoCacheQueryOptions) already
    //      tolerates per-outpoint. Doubling up just delayed the surface.
    //
    // If subfrost regresses to needing one of these again, re-add the
    // SPECIFIC fallback (with the failure-mode evidence in the comment)
    // rather than re-introducing the whole chain.
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: buildHeadersForUrl(targetUrl),
      body: JSON.stringify(body),
    });

    // Read the response body once. Upstream is always JSON-RPC, but
    // infrastructure errors (nginx 502, rate limits, service unavailable)
    // may return plain text or HTML.
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Non-JSON response — propagate as a JSON-RPC error. No retry, no
      // fallback (see header comment above).
      const snippet = responseText.slice(0, 200).replace(/<[^>]*>/g, '').trim();
      console.error(`[RPC Proxy] Non-JSON upstream response (${response.status}) for ${method}: ${snippet}`);
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32603, message: `Upstream error (${response.status}): ${snippet}` }, id: body?.id ?? null },
        { status: 502 }
      );
    }

    // Non-200 status with valid JSON body — forward the JSON-RPC error as-is
    if (!response.ok) {
      console.error(`[RPC Proxy] Upstream HTTP ${response.status} for ${method}`);
      return NextResponse.json(data, { status: response.status });
    }

    // Log UTXO fetch results for debugging
    if (method === 'esplora_address::utxo') {
      const resultCount = Array.isArray(data?.result) ? data.result.length : 0;
      console.log(`[RPC Proxy] esplora_address::utxo returned ${resultCount} UTXOs`);
      if (resultCount === 0) {
        console.log(`[RPC Proxy] esplora_address::utxo params:`, body?.params);
        console.log(`[RPC Proxy] Full response:`, JSON.stringify(data).slice(0, 200));
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[RPC Proxy] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'RPC proxy error' },
      { status: 500 }
    );
  }
}
