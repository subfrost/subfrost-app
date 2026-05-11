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
 * JOURNAL ENTRY (2026-05-11): Both `metashrew_view` AND `metashrew_height`
 * now route to /v6/subfrost on mainnet so they read the same replica's
 * indexer state. Earlier split (height on /v4) caused phantom multi-block
 * lag when /v4's replica fell behind /v6's — see pickEndpoint comment for
 * the full rationale and the rate-limit re-verification.
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
// requests with `metashrew_view` AND `metashrew_height` route here instead
// of `RPC_ENDPOINTS[network]`. Other methods (`bitcoin_*`, `alkanes_*`,
// `esplora_*`) and REST sub-paths still go through the gateway endpoint.
//
// Both metashrew methods share the /v6 route because /v4 and /v6 route to
// DIFFERENT subfrost replicas with independent indexer state — and /v4 has
// been observed lagging /v6 by 5+ blocks under load. Routing height to /v4
// while view stayed on /v6 made the SDK's sync gate see a phantom multi-
// block lag and time out (948881 from /v4 vs 948886 from /v6 vs 948888
// from bitcoind, observed 2026-05-11). Co-locating height and view on the
// same replica eliminates the cross-replica drift.
//
// See `pickEndpoint` below for the full rationale (including why the
// previously-feared /v6 rate-limit on the SDK's 500ms height poll was
// re-verified to no longer fire).
//
// Other networks left undefined (no override → use the gateway URL for
// everything).
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

  // Single requests: route both metashrew_view AND metashrew_height to the
  // dedicated metashrew endpoint when the network has one configured.
  //
  // Why metashrew_height now goes to /v6 (UPDATED 2026-05-11):
  // /v4/subfrost and /v6/subfrost route to DIFFERENT replicas with
  // independent indexer state. Verified live 2026-05-11:
  //   /v4 metashrew_height -> 948881
  //   /v6 metashrew_height -> 948886  (5 blocks ahead of /v4)
  //   bitcoind getblockcount -> 948888
  // The /v4 replica was lagging the /v6 replica by 5 blocks, which made
  // the SDK's sync gate see a 7-block lag (948888 - 948881) when the
  // *real* lag against the fresher replica was only 2 blocks (948888 -
  // 948886). The 2-block apparent lag would close in seconds; the
  // 7-block apparent lag burned all 60 sync retries (~30s) and the swap
  // aborted with "Indexer sync timed out".
  //
  // The earlier "DO NOT route metashrew_height to /v6" warning (commit
  // 3d3b48eb) was based on /v6 returning HTTP 429 under the SDK's
  // ~500ms poll cadence. Re-verified 2026-05-11 by hammering /v6 8 times
  // at 500ms intervals: 8/8 succeeded with HTTP 200 in ~70ms each, no
  // 429. Whatever rate-limit window /v6 used to enforce is gone (or
  // raised), so the safety reason for keeping height on /v4 no longer
  // applies — and /v4's stale-replica drift is now the bigger risk.
  //
  // If /v6 starts 429-ing the height poll again, the symptom is "Network
  // error: HTTP error: 429" inside `Waiting for indexer to sync` — at
  // that point split metashrew_height back to /v4 with an exponential
  // backoff in the proxy, OR move only the height polling onto a
  // dedicated low-cap endpoint.
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
      headers: { 'Content-Type': 'application/json' },
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
