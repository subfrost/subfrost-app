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
 * JOURNAL ENTRY (2026-05-17, final): **ALL traffic on /v4/subfrost. NEVER /v6.**
 * Per user directive 2026-05-17: subfrost-app must never originate /v6/subfrost
 * traffic. /v4/subfrost is the only sanctioned mainnet gateway. Every
 * JSON-RPC method (metashrew_view, metashrew_height, alkanes_*, esplora_*,
 * bitcoin_*) and every REST sub-path routes to /v4/subfrost (or to
 * alkanode for the espo-served REST sub-paths). The METASHREW_RPC_ENDPOINTS
 * override map and SUBFROST_V6_API_KEY env var were removed — their only
 * historical purpose was the /v6 split.
 *
 * See pickEndpoint below for the routing details.
 */

import { NextRequest, NextResponse } from 'next/server';

// All RPC endpoints point to subfrost infrastructure.
//
// JOURNAL ENTRY (2026-05-10/11): mainnet dual-routes by protocol.
// Per @flex: REST sub-paths under /v4/subfrost are espo routes and should
// be bypassed to alkanode; JSON-RPC goes through /v4/subfrost.
//
// Routing matrix for mainnet:
//   - metashrew_view/metashrew_height         → /v4/subfrost (gateway)
//   - REST sub-paths (/get-all-amm-tx-history etc.) → alkanode (canon Espo)
//   - All other JSON-RPC                      → /v4/subfrost (gateway)
//
// Other networks (testnet/signet/regtest) stay on /v4/<token>.
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

// All upstream requests carry only Content-Type. There is no per-URL auth
// branching anymore — the /v6 split was removed (2026-05-17, user directive)
// and /v4/subfrost is sanctioned for unauthenticated traffic at the rate
// the app produces. Any future auth requirement should live here.
function buildHeadersForUrl(_url: string): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function elapsedMs(startMs: number): string {
  return `${Date.now() - startMs}ms`;
}

function logProxyResponse(method: string, targetUrl: string, status: number | string, startMs: number) {
  console.log(`[RPC Proxy] ${method} <- ${targetUrl} ${status} in ${elapsedMs(startMs)}`);
}

function getJsonRpcMethodLabel(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fallback;

  const rpcBody = body as { method?: unknown; params?: unknown };
  if (rpcBody.method !== 'alkanes_simulate') {
    return typeof rpcBody.method === 'string' ? rpcBody.method : fallback;
  }

  const firstParam = Array.isArray(rpcBody.params) ? rpcBody.params[0] : undefined;
  if (!firstParam || typeof firstParam !== 'object') return 'alkanes_simulate';

  const simulateParams = firstParam as { target?: unknown; inputs?: unknown };
  const target = simulateParams.target;
  const targetLabel = typeof target === 'string'
    ? target
    : target && typeof target === 'object'
      ? `${String((target as { block?: unknown }).block ?? '?')}:${String((target as { tx?: unknown }).tx ?? '?')}`
      : '?';
  const opcode = Array.isArray(simulateParams.inputs) ? simulateParams.inputs[0] : undefined;

  return `alkanes_simulate[${targetLabel}${opcode != null ? ` op=${String(opcode)}` : ''}]`;
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

// Bitcoin Core JSON-RPC methods must go to the bitcoind/jsonrpc backend.
// Sending `sendrawtransaction` through /v4/subfrost can hit an Esplora-style
// text response underneath, which the SDK surfaces as:
//   JSON-RPC -32603 "error decoding response body"
const BITCOIN_RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/jsonrpc',
  testnet: 'https://testnet.subfrost.io/v4/jsonrpc',
  signet: 'https://signet.subfrost.io/v4/jsonrpc',
  regtest: 'https://regtest.subfrost.io/v4/jsonrpc',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/jsonrpc',
  oylnet: 'https://regtest.subfrost.io/v4/jsonrpc',
};

const BITCOIN_RPC_METHODS = new Set([
  'getblockcount',
  'getblockhash',
  'getblock',
  'getrawtransaction',
  'sendrawtransaction',
  'sendrawtransactions',
  'submitpackage',
  'generatetoaddress',
  'getrawmempool',
  'gettxout',
  'getmempoolinfo',
]);

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
const ALKANODE_JSONRPC_MAINNET =
  process.env.ESPO_MAINNET_JSONRPC_URL || 'https://api.alkanode.com/rpc';
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

  // Single requests: every JSON-RPC method (metashrew_view, metashrew_height,
  // alkanes_*, bitcoin_*, esplora_*) goes to the /v4/subfrost gateway. No
  // per-method splits. REST sub-paths still bypass subfrost.io and go to
  // alkanode on mainnet (handled in the segments-branch above, not here).
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
    let targetUrl = '';
    let requestLabel = '';

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
        requestLabel = restPath.join('/');
        if (restPath[0] === 'espo') {
          targetUrl = networkSegment === 'mainnet'
            ? ALKANODE_JSONRPC_MAINNET
            : `${(RPC_ENDPOINTS[networkSegment] || RPC_ENDPOINTS.regtest).replace(/\/$/, '')}/espo`;
        } else if (networkSegment === 'qubitcoin-regtest') {
          // Route /espo sub-path to espo JSON-RPC on server
          if (restPath[0] === 'espo') {
            const espoUrl = QBC_ESPO + '/rpc';
            console.log(`[RPC Proxy] qubitcoin-regtest /espo → ${espoUrl}`);
            try {
              const espoBody = await request.clone().json().catch(() => ({}));
              const startMs = Date.now();
              const espoResp = await fetch(espoUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(espoBody),
              });
              const espoData = await espoResp.json();
              logProxyResponse('qubitcoin-regtest /espo', espoUrl, espoResp.status, startMs);
              return NextResponse.json(espoData);
            } catch (e) {
              console.log(`[RPC Proxy] qubitcoin-regtest /espo failed:`, e);
              return NextResponse.json({ jsonrpc: '2.0', error: { code: -32603, message: 'espo unavailable' }, id: null });
            }
          }
          // /get-block-height → fetch from metashrew
          if (restPath[0] === 'get-block-height') {
            try {
              const startMs = Date.now();
              const hResp = await fetch(QBC_METASHREW, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'metashrew_height', params: [], id: 1 }),
              });
              const hData = await hResp.json();
              const height = parseInt(hData.result, 10) || 0;
              console.log(`[RPC Proxy] qubitcoin-regtest /get-block-height -> ${height} in ${elapsedMs(startMs)}`);
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
        if (!targetUrl) {
          const restPrimary = REST_PRIMARY_BASE_URLS[network]
            || RPC_ENDPOINTS[network]
            || RPC_ENDPOINTS.regtest;
          const baseUrl = restPrimary.replace(/\/$/, '');
          targetUrl = `${baseUrl}/${restPath.join('/')}`;
        }
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

    // The SDK's broadcast helper may call `esplora_tx::broadcast`, which is
    // routed by subfrost through an Esplora-style backend that can return a
    // plain-text response. That bubbles up as "error decoding response body".
    // Send raw transactions through the Bitcoin JSON-RPC method instead; it
    // returns a normal JSON-RPC string txid and avoids the decode path entirely.
    if (!Array.isArray(body) && body?.method === 'esplora_tx::broadcast') {
      body.method = 'sendrawtransaction';
    }

    if (!Array.isArray(body) && BITCOIN_RPC_METHODS.has(body?.method)) {
      if (body.method === 'sendrawtransaction') {
        console.log(`[RPC Proxy] sendrawtransaction: ${body.params?.[0]?.length || 0} hex chars, params: ${body.params?.length}`);
      } else if (body.method === 'sendrawtransactions' || body.method === 'submitpackage') {
        const txHexes = Array.isArray(body.params?.[0]) ? body.params[0] : body.params;
        console.log(`[RPC Proxy] ${body.method}: ${txHexes?.length || 0} txs`);
      }
      targetUrl = BITCOIN_RPC_ENDPOINTS[network] || BITCOIN_RPC_ENDPOINTS.regtest;
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
            const esploraUrl = `${esploraBase}${esploraPath}`;
            const startMs = Date.now();
            const esploraResp = await fetch(esploraUrl);
            const esploraData = await esploraResp.json();
            logProxyResponse(m, esploraUrl, esploraResp.status, startMs);
            return NextResponse.json({ jsonrpc: '2.0', result: esploraData, id: body.id ?? 1 });
          } catch {
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
                 'sendrawtransaction', 'submitpackage', 'generatetoaddress', 'getrawmempool',
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

    // Log for debugging. For JSON-RPC batches, include method names so the
    // dev server clearly shows one outbound request carrying multiple calls.
    const method = Array.isArray(body)
      ? `batch[${body.map((item: any) => item?.method).filter(Boolean).join(', ')}]`
      : getJsonRpcMethodLabel(body, requestLabel || 'unknown');
    console.log(`[RPC Proxy] ${method} -> ${targetUrl}`);

    // Single upstream, no fallbacks. Per flex 2026-05-11: "OK lets remove
    // all fallbacks everywhere. We should never have more than 1 way to do
    // something." This used to carry fallback chains for metashrew /v6,
    // metashrew-unwrap, rate-limit retries, and alkanes_* retries. Those
    // are intentionally gone: metashrew now falls through to /v4/subfrost,
    // mainnet REST sub-paths go to alkanode, and client-side caches already
    // tolerate per-outpoint failures where needed.
    //
    // If subfrost regresses to needing one of these again, re-add the
    // SPECIFIC fallback (with the failure-mode evidence in the comment)
    // rather than re-introducing the whole chain.
    const startMs = Date.now();
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: buildHeadersForUrl(targetUrl),
      body: JSON.stringify(body),
    });

    // Read the response body once. Upstream is always JSON-RPC, but
    // infrastructure errors (nginx 502, rate limits, service unavailable)
    // may return plain text or HTML.
    const responseText = await response.text();
    logProxyResponse(method || 'unknown', targetUrl, response.status, startMs);
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
