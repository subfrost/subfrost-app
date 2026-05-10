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
 * JOURNAL ENTRY (2026-02-07): Removed alkanode/Espo routing. All methods go
 * to subfrost endpoints. Pool data, token info, and heights are fetched via
 * the @alkanes/ts-sdk bindings or alkanes_simulate on subfrost RPC.
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
//   - metashrew_view, metashrew_height       → /v6/subfrost (sticky, ~30× faster)
//   - REST sub-paths (/get-all-amm-tx-history etc.) → /v4/subfrost (data API)
//   - All other JSON-RPC                      → /v4/subfrost (gateway)
//
// /v6/subfrost benefit: 27-way parallel protorunesbyoutpoint fanout completes
// in ~0.18-0.29s wall time vs 0.92s on /v4/subfrost vs 8.7s on /v4/<token>.
// /v6/subfrost rate-limits aggressive bursts (HTTP 429) but the wallet cache's
// fetchWithRetry handles those with [0, 500, 1500]ms backoff.
//
// Other networks (testnet/signet/regtest) stay on /v4/<token> — only mainnet
// has the dual-endpoint split.
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

// Per-network metashrew-only endpoint. When set for a network, JSON-RPC
// requests with method `metashrew_view` or `metashrew_height` route here
// instead of `RPC_ENDPOINTS[network]`. Other methods (bitcoin_*, alkanes_*,
// esplora_*) and REST sub-paths still go through the gateway endpoint.
//
// Mainnet uses /v6/subfrost which is metashrew-sticky and significantly faster
// for the wallet cache prewarm fanout. Other networks left undefined (no
// override → use the gateway URL for everything).
const METASHREW_RPC_ENDPOINTS: Record<string, string | undefined> = {
  mainnet: 'https://mainnet.subfrost.io/v6/subfrost',
};

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

// Fallback Espo REST host for mainnet — same OYL module contract as subfrost
// (verified against /get-all-amm-tx-history, /get-all-pools-details, etc).
// Used only for REST sub-path requests when the primary returns non-2xx, so
// landing-page surfaces (Activity Feed, Trending Pair) survive Subfrost-side
// Espo outages. Set `ESPO_MAINNET_FALLBACK_URL=""` to disable.
const restFallbackEnv = process.env.ESPO_MAINNET_FALLBACK_URL;
const REST_FALLBACK_BASE_URLS: Record<string, string> = {};
if (restFallbackEnv === undefined) {
  REST_FALLBACK_BASE_URLS.mainnet = 'https://oyl.alkanode.com';
} else if (restFallbackEnv.length > 0) {
  REST_FALLBACK_BASE_URLS.mainnet = restFallbackEnv;
}

function pickEndpoint(body: any, network: string) {
  const isBatch = Array.isArray(body);

  // Batch requests don't get method-level routing — they may contain mixed
  // methods, and splitting batches client-side is more complexity than the
  // perf delta justifies. Use the gateway endpoint for batches.
  if (isBatch) {
    return BATCH_RPC_ENDPOINTS[network] || BATCH_RPC_ENDPOINTS.regtest;
  }

  // Single requests: route metashrew_view + metashrew_height to the dedicated
  // metashrew endpoint when the network has one configured. Everything else
  // (bitcoin_*, alkanes_*, esplora_*) goes to the gateway endpoint.
  const method = typeof body?.method === 'string' ? body.method : '';
  const isMetashrew = method === 'metashrew_view' || method === 'metashrew_height';
  const metashrewUrl = METASHREW_RPC_ENDPOINTS[network];
  if (isMetashrew && metashrewUrl) {
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
    // Tracks whether this is a REST sub-path request (e.g. /get-all-amm-tx-history)
    // and the joined path so we can construct an alkanode fallback URL on
    // primary failure. JSON-RPC requests don't use this — they have their
    // own metashrew-unwrap fallback below.
    let restSubPath: string | null = null;

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
        // REST sub-path: forward to backend base URL + rest path
        const baseUrl = (RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest).replace(/\/$/, '');
        restSubPath = restPath.join('/');
        targetUrl = `${baseUrl}/${restSubPath}`;
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

    // Fallback endpoint for mainnet when primary hits metashrew-unwrap errors.
    // Mainnet primary is /v4/subfrost (faster for metashrew_view fanout) but it
    // returns metashrew-unwrap routing errors on metashrew_height — the fallback
    // /v4/jsonrpc handles those reliably.
    const FALLBACK_ENDPOINTS: Record<string, string> = {
      mainnet: 'https://mainnet.subfrost.io/v4/jsonrpc',
      testnet: 'https://testnet.subfrost.io/v4/jsonrpc',
      signet: 'https://signet.subfrost.io/v4/jsonrpc',
    };

    let response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // REST sub-path Espo fallback. When the primary upstream returns 5xx /
    // non-JSON / connection error for a /get-* style request, retry against
    // alkanode (or whatever ESPO_MAINNET_FALLBACK_URL is set to). JSON-RPC
    // requests are unaffected — they have their own metashrew-unwrap
    // fallback below and route to a different upstream.
    const restFallbackBase = restSubPath ? REST_FALLBACK_BASE_URLS[network] : null;
    if (restSubPath && restFallbackBase && !response.ok) {
      const fallbackUrl = `${restFallbackBase.replace(/\/$/, '')}/${restSubPath}`;
      console.warn(`[RPC Proxy] REST primary ${response.status} for /${restSubPath}; falling back to ${fallbackUrl}`);
      try {
        const fallbackResp = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (fallbackResp.ok) {
          response = fallbackResp;
        } else {
          console.warn(`[RPC Proxy] REST fallback also failed: ${fallbackResp.status}`);
        }
      } catch (fallbackErr) {
        console.warn(`[RPC Proxy] REST fallback threw:`, fallbackErr);
      }
    }

    // Read the response body once. Upstream is always JSON-RPC, but infrastructure
    // errors (nginx 502, rate limits, service unavailable) may return plain text or HTML.
    let responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Non-JSON response — this is an infrastructure error, not a JSON-RPC response.
      // Common causes: nginx "upstream request failed", rate limit HTML pages, 408/502/503 errors.

      // Metashrew-route fallback. /v6/subfrost is the fast metashrew-only path
      // for mainnet (see METASHREW_RPC_ENDPOINTS) but it intermittently returns
      // 408 timeouts and 502s under load. When that happens for a metashrew_*
      // request, retry against the network's gateway (RPC_ENDPOINTS) which
      // also serves metashrew calls (slower, no sticky-session optimization).
      //
      // The gateway is itself flaky on metashrew_height under burst load
      // (~5% non-JSON 502s), so we retry up to 3 times with progressive
      // backoff. Without all attempts, the WASM SDK's `select_utxos`
      // sees the 502 and aborts the entire swap with "Network error".
      const isMetashrewMethod = !Array.isArray(body) &&
        (body?.method === 'metashrew_view' || body?.method === 'metashrew_height');
      const metashrewPrimary = METASHREW_RPC_ENDPOINTS[network];
      const gatewayUrl = RPC_ENDPOINTS[network];
      if (isMetashrewMethod && metashrewPrimary && gatewayUrl && targetUrl === metashrewPrimary) {
        console.warn(`[RPC Proxy] metashrew primary ${response.status} for ${body.method}; falling back to ${gatewayUrl}`);
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 200 * attempt));
          }
          try {
            const fallbackResp = await fetch(gatewayUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const fallbackText = await fallbackResp.text();
            try {
              const fallbackData = JSON.parse(fallbackText);
              if (!fallbackData?.error) {
                if (attempt > 0) {
                  console.warn(`[RPC Proxy] metashrew non-JSON fallback succeeded on attempt ${attempt + 1} for ${body.method}`);
                }
                return NextResponse.json(fallbackData);
              }
              // JSON-RPC error from gateway — retry.
            } catch { /* fallback also non-JSON, retry */ }
          } catch { /* fallback request failed, retry */ }
        }
        console.warn(`[RPC Proxy] metashrew non-JSON fallback exhausted for ${body.method}; falling through to error response`);
      }

      // For REST sub-paths, attempt the alkanode fallback as a last resort.
      if (restSubPath && restFallbackBase) {
        const fallbackUrl = `${restFallbackBase.replace(/\/$/, '')}/${restSubPath}`;
        console.warn(`[RPC Proxy] REST primary returned non-JSON for /${restSubPath}; trying ${fallbackUrl}`);
        try {
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const fallbackText = await fallbackResp.text();
          try {
            return NextResponse.json(JSON.parse(fallbackText), { status: fallbackResp.status });
          } catch { /* fall through to error response below */ }
        } catch { /* fall through */ }
      }
      const snippet = responseText.slice(0, 200).replace(/<[^>]*>/g, '').trim(); // strip HTML tags
      console.error(`[RPC Proxy] Non-JSON upstream response (${response.status}) for ${method}: ${snippet}`);
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32603, message: `Upstream error (${response.status}): ${snippet}` }, id: body?.id ?? null },
        { status: 502 }
      );
    }

    // REST sub-path "200-with-empty" fallback. Subfrost espo intermittently
    // returns successful HTTP 200 responses with empty data while it's
    // catching up on indexing — but the alkanode mirror has the real data.
    // The 5xx fallback above doesn't fire on 200, and consumers that don't
    // implement their own emptiness check (which is most of them) silently
    // shadow real data with empty data.
    //
    // Detect both common OYL-API empty shapes:
    //   { data: { total: 0, ... } }         (paginated endpoints)
    //   { data: [] }                         (list endpoints)
    // For either, retry against the configured REST fallback (alkanode on
    // mainnet) and use its response if it has more data than primary.
    //
    // Skipped if response is non-2xx or already-fallback'd (the 5xx path
    // above already handled it) or if no REST fallback is configured.
    if (
      restSubPath &&
      restFallbackBase &&
      response.ok
    ) {
      const isEmpty = (parsed: any): boolean => {
        const d = parsed?.data;
        if (Array.isArray(d)) return d.length === 0;
        if (typeof d?.total === 'number') return d.total === 0;
        if (typeof d?.count === 'number') return d.count === 0;
        return false;
      };
      if (isEmpty(data)) {
        const fallbackUrl = `${restFallbackBase.replace(/\/$/, '')}/${restSubPath}`;
        console.warn(`[RPC Proxy] REST primary returned empty for /${restSubPath} (likely indexer drift); checking ${fallbackUrl}`);
        try {
          const fallbackResp = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (fallbackResp.ok) {
            const fallbackText = await fallbackResp.text();
            try {
              const fallbackParsed = JSON.parse(fallbackText);
              if (!isEmpty(fallbackParsed)) {
                console.warn(`[RPC Proxy] REST fallback ${fallbackUrl} returned non-empty data; using fallback`);
                data = fallbackParsed;
              }
            } catch { /* fallback non-JSON; keep primary */ }
          }
        } catch (fallbackErr) {
          console.warn(`[RPC Proxy] REST empty-fallback threw:`, fallbackErr);
        }
      }
    }

    // Retry on metashrew-unwrap errors — fallback to /v4/jsonrpc which routes correctly
    if (data?.error?.message?.includes('metashrew-unwrap') && network && FALLBACK_ENDPOINTS[network]) {
      console.log(`[RPC Proxy] metashrew-unwrap error, retrying via fallback: ${FALLBACK_ENDPOINTS[network]}`);
      try {
        const fallbackResp = await fetch(FALLBACK_ENDPOINTS[network], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const fallbackText = await fallbackResp.text();
        const fallbackData = JSON.parse(fallbackText);
        if (!fallbackData?.error) {
          data = fallbackData;
        }
      } catch { /* fallback failed, use original error */ }
    }

    // Metashrew rate-limit / error fallback. /v6/subfrost rate-limits aggressive
    // bursts (HTTP 429) and the wallet cache's per-call retry doesn't backoff
    // enough to clear the rate window — every 429 cascades into a balance error.
    // When a metashrew_* request gets a non-2xx OR a JSON-RPC error from the
    // sticky /v6 endpoint, retry once against the gateway URL which serves the
    // same method (slower, no rate limit, no sticky session).
    {
      const isMetashrewMethod = !Array.isArray(body) &&
        (body?.method === 'metashrew_view' || body?.method === 'metashrew_height');
      const metashrewPrimary = METASHREW_RPC_ENDPOINTS[network];
      const gatewayUrl = RPC_ENDPOINTS[network];
      const upstreamFailed = !response.ok || !!data?.error;
      if (
        isMetashrewMethod &&
        metashrewPrimary &&
        gatewayUrl &&
        targetUrl === metashrewPrimary &&
        upstreamFailed
      ) {
        console.warn(
          `[RPC Proxy] metashrew primary ${response.status} for ${body.method}; falling back to ${gatewayUrl}`
        );
        try {
          const fallbackResp = await fetch(gatewayUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const fallbackText = await fallbackResp.text();
          try {
            const fallbackData = JSON.parse(fallbackText);
            if (!fallbackData?.error) {
              return NextResponse.json(fallbackData);
            }
          } catch { /* fallback also non-JSON, fall through to original error */ }
        } catch { /* fallback request failed, fall through */ }
      }
    }

    // alkanes_* retry on transient gateway errors. The /v4/subfrost gateway
    // returns transient JSON-RPC errors (~3-7% of bursts) on
    // alkanes_protorunesbyoutpoint and friends — "metashrew-unwrap" /
    // "error decoding response body" / similar non-deterministic signatures.
    // Each failed call cascades through the wallet cache's fetchWithRetry
    // (3× per outpoint) and, if even one outpoint exhausts retries, blanks
    // the whole alkane balance display. This block adds a server-side retry
    // (up to 2 extra attempts, ~100ms backoff) so transient errors don't
    // reach the client. If retries are also exhausted we forward the last
    // response as-is (the client cache will retry, and Layer 2's alkanode
    // fallback in queries/account.ts catches the steady-state empty case).
    {
      const isAlkanesRpc = !Array.isArray(body) &&
        typeof body?.method === 'string' &&
        body.method.startsWith('alkanes_');
      const upstreamFailed = !response.ok || !!data?.error;
      if (isAlkanesRpc && upstreamFailed && network) {
        for (let attempt = 0; attempt < 2; attempt++) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
          try {
            const retryResp = await fetch(targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
            const retryText = await retryResp.text();
            try {
              const retryData = JSON.parse(retryText);
              if (retryResp.ok && !retryData?.error) {
                if (attempt > 0 || !response.ok) {
                  console.warn(`[RPC Proxy] alkanes_* retry succeeded on attempt ${attempt + 2} for ${body.method}`);
                }
                return NextResponse.json(retryData);
              }
              // Update `data` so a downstream fallback (or the client-cache
              // retry loop) sees the most-recent response, not a stale one.
              data = retryData;
            } catch { /* retry non-JSON; loop again */ }
          } catch { /* retry threw; loop again */ }
        }
      }
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
