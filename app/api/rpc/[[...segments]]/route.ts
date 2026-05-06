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

// All RPC endpoints point to subfrost infrastructure
const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  testnet: 'https://testnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  signet: 'https://signet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  regtest: 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
  oylnet: 'https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75',
};

// Batch JSON-RPC requests are more reliably handled by the explicit /jsonrpc path
const BATCH_RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/jsonrpc',
  testnet: 'https://testnet.subfrost.io/v4/jsonrpc',
  signet: 'https://signet.subfrost.io/v4/jsonrpc',
  regtest: 'https://regtest.subfrost.io/v4/jsonrpc',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/jsonrpc',
  oylnet: 'https://regtest.subfrost.io/v4/jsonrpc',
};

/**
 * Best-effort fetch of mempool.space's tip height. Used when reshaping a
 * mempool.space UTXO array into the WASM SDK's lua-script response shape
 * (`spendable`/`immature`/`currentHeight`/`address`). Failure returns null
 * — the caller falls back to confirmations=0, which is conservative but
 * doesn't break the SDK's downstream consumption.
 */
async function fetchMempoolTipHeight(): Promise<number | null> {
  try {
    const r = await fetch('https://mempool.space/api/blocks/tip/height', {
      headers: { 'Accept': 'text/plain' },
    });
    if (!r.ok) return null;
    const text = (await r.text()).trim();
    const n = parseInt(text, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function pickEndpoint(body: any, network: string) {
  const isBatch = Array.isArray(body);
  const single = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest;
  const batch = BATCH_RPC_ENDPOINTS[network] || BATCH_RPC_ENDPOINTS.regtest;
  return isBatch ? batch : single;
}

/**
 * Translate a JSON-RPC esplora method to the equivalent mempool.space REST
 * path so we can fall back when the upstream gateway's internal esplora pod
 * is unreachable. Returns null when the method has no clean REST equivalent
 * (caller skips the fallback and surfaces the original error).
 *
 * Why: the WASM SDK calls `esplora_address::utxo` etc. as JSON-RPC methods.
 * The subfrost gateway proxies those to its internal esplora; when that pod
 * dies, every UTXO-touching mutation fails with "Insufficient funds" because
 * the SDK has no UTXOs to work with. Mempool.space exposes the same REST
 * shape on mainnet, so we re-route the failing method there. Mainnet only —
 * mempool.space doesn't carry our regtest/signet networks at this URL shape.
 */
function mapJsonRpcToEsploraRestPath(
  method: string | undefined,
  params: unknown[] | undefined,
  errorMessage?: string,
): string | null {
  if (!method || !Array.isArray(params)) return null;
  const [first, second] = params as [string?, string?];
  switch (method) {
    case 'esplora_address::utxo':
      return first ? `address/${first}/utxo` : null;
    case 'esplora_address::txs':
      return first ? `address/${first}/txs` : null;
    case 'esplora_address::txs:mempool':
      return first ? `address/${first}/txs/mempool` : null;
    case 'esplora_tx':
      return first ? `tx/${first}` : null;
    case 'esplora_tx::hex':
      return first ? `tx/${first}/hex` : null;
    case 'esplora_blocks::tip-height':
      return 'blocks/tip/height';
    case 'esplora_blocks::tip-hash':
      return 'blocks/tip/hash';
    // The WASM SDK's wallet provider runs an inline lua script before falling
    // back to direct JSON-RPC. The script calls `_RPC.esplora_addressutxo(addr)`
    // internally, so the same upstream-esplora-down condition surfaces here.
    // Detect via the error stack-trace mentioning the lua field name; the
    // address is always the second param (first is the script text).
    case 'lua_evalscript':
      if (typeof second !== 'string' || !errorMessage) return null;
      if (errorMessage.includes('esplora_addressutxo')) {
        return `address/${second}/utxo`;
      }
      if (errorMessage.includes('esplora_address') && errorMessage.includes('mempool')) {
        return `address/${second}/txs/mempool`;
      }
      if (errorMessage.includes('esplora_address')) {
        return `address/${second}/txs`;
      }
      return null;
    default:
      return null;
  }
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
        // REST sub-path: forward to backend base URL + rest path
        const baseUrl = (RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest).replace(/\/$/, '');
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

    // Fallback endpoint for mainnet when primary hits metashrew-unwrap errors
    const FALLBACK_ENDPOINTS: Record<string, string> = {
      mainnet: 'https://mainnet.subfrost.io/v4/jsonrpc',
      testnet: 'https://testnet.subfrost.io/v4/jsonrpc',
      signet: 'https://signet.subfrost.io/v4/jsonrpc',
    };

    // Direct mempool.space route for the WASM SDK's wallet-provider lua script.
    //
    // Why this is a *bypass* rather than just a fallback: the upstream gateway's
    // lua executor was observed (2026-05-06) to return a stale UTXO snapshot
    // for confirmed addresses — missing entire UTXOs that esplora and
    // mempool.space both report. The WASM SDK trusts this list and ignores the
    // `payment_utxos` we pass into alkanesExecuteTyped, so the SDK ends up
    // selecting only the dust UTXOs the lua list happens to contain and fails
    // with "Insufficient funds: inputs (X) < outputs (Y) + fee (Z)".
    //
    // The standard wallet-provider script is identifiable by its body — it
    // calls `_RPC.esplora_addressutxo(address)` and returns a
    // `{spendable, immature, currentHeight, address}` shape. When we see that
    // exact pattern on mainnet, we skip the upstream and serve a mempool.space
    // response in the same shape. Other lua scripts (custom user calls) still
    // go through upstream untouched.
    //
    // Mainnet only — mempool.space doesn't carry our other networks at this
    // URL shape.
    if (
      method === 'lua_evalscript' &&
      network === 'mainnet' &&
      Array.isArray(body?.params) &&
      typeof body.params[0] === 'string' &&
      typeof body.params[1] === 'string' &&
      body.params[0].includes('_RPC.esplora_addressutxo') &&
      body.params[0].includes('spendable')
    ) {
      const address = body.params[1];
      console.log(`[RPC Proxy] lua_evalscript wallet-provider script intercepted, serving from mempool.space for ${address}`);
      try {
        const [utxosResp, tipHeight] = await Promise.all([
          fetch(`https://mempool.space/api/address/${address}/utxo`, {
            headers: { 'Accept': 'application/json' },
          }),
          fetchMempoolTipHeight(),
        ]);
        if (utxosResp.ok) {
          const raw = await utxosResp.json();
          if (Array.isArray(raw)) {
            const spendable: any[] = [];
            const immature: any[] = [];
            for (const u of raw) {
              if (!u?.status?.confirmed) continue;
              const height = u.status.block_height;
              const confirmations =
                typeof tipHeight === 'number' && typeof height === 'number'
                  ? tipHeight - height + 1
                  : 0;
              spendable.push({
                txid: u.txid,
                vout: u.vout,
                value: u.value,
                outpoint: `${u.txid}:${u.vout}`,
                height,
                confirmations,
                is_coinbase: false,
              });
            }
            return NextResponse.json({
              jsonrpc: '2.0',
              result: {
                spendable,
                immature,
                currentHeight: tipHeight ?? 0,
                address,
              },
              id: body?.id ?? null,
            });
          }
        }
      } catch (e) {
        console.warn(`[RPC Proxy] mempool.space bypass failed, falling through to upstream:`, e);
      }
    }

    let response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Read the response body once. Upstream is always JSON-RPC, but infrastructure
    // errors (nginx 502, rate limits, service unavailable) may return plain text or HTML.
    let responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Non-JSON response — this is an infrastructure error, not a JSON-RPC response.
      // Common causes: nginx "upstream request failed", rate limit HTML pages, 502/503 errors.
      const snippet = responseText.slice(0, 200).replace(/<[^>]*>/g, '').trim(); // strip HTML tags
      console.error(`[RPC Proxy] Non-JSON upstream response (${response.status}) for ${method}: ${snippet}`);
      return NextResponse.json(
        { jsonrpc: '2.0', error: { code: -32603, message: `Upstream error (${response.status}): ${snippet}` }, id: body?.id ?? null },
        { status: 502 }
      );
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

    // Mempool.space fallback for esplora-down errors on mainnet.
    //
    // Why: the upstream gateway proxies several JSON-RPC methods to an internal
    // esplora pod. When that pod is unreachable, calls fail with
    // `error sending request for url (http://esplora:50010/...)`. The WASM SDK
    // calls these methods directly and, despite us pre-supplying `payment_utxos`
    // to alkanesExecuteTyped, the WASM still fetches its own UTXO list before
    // building the PSBT — so an esplora outage manifests to the user as
    // "Insufficient BTC for transaction fees" even though all params were correct.
    //
    // Mempool.space exposes the same esplora REST API for mainnet. We translate
    // the failing JSON-RPC method to a mempool.space REST GET, then re-shape the
    // response to a JSON-RPC envelope. Mainnet only — testnet/signet/regtest are
    // not on mempool.space at this URL shape.
    const isEsploraUpstreamDown =
      data?.error?.message?.includes('error sending request for url') &&
      data.error.message.includes('esplora:');
    if (isEsploraUpstreamDown && network === 'mainnet') {
      const mempoolPath = mapJsonRpcToEsploraRestPath(
        method,
        body?.params,
        data?.error?.message,
      );
      if (mempoolPath) {
        console.log(`[RPC Proxy] esplora upstream down, falling back to mempool.space: ${mempoolPath}`);
        try {
          const mempoolResp = await fetch(`https://mempool.space/api/${mempoolPath}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });
          if (mempoolResp.ok) {
            const raw = await mempoolResp.json();
            // The WASM SDK's lua wallet-provider script returns a structured
            // shape: `{ spendable, immature, currentHeight, address }`. We
            // re-shape mempool.space's plain UTXO array into that contract so
            // the SDK can consume the response without a downstream change.
            // Coinbase maturity check (100-block rule) is preserved at best
            // effort using the tip height we already had to fetch.
            let result: unknown = raw;
            if (method === 'lua_evalscript' && Array.isArray(raw)) {
              const address = (body?.params as string[] | undefined)?.[1] ?? '';
              const tipHeight = await fetchMempoolTipHeight();
              const COINBASE_MATURITY = 100;
              const spendable: any[] = [];
              const immature: any[] = [];
              for (const u of raw) {
                if (!u?.status?.confirmed) continue;
                const height = u.status.block_height;
                const confirmations =
                  typeof tipHeight === 'number' && typeof height === 'number'
                    ? tipHeight - height + 1
                    : 0;
                // mempool.space doesn't expose is_coinbase on the utxo list;
                // we treat all confirmed UTXOs as spendable here. The SDK's
                // own coin selection would re-check is_coinbase via tx detail
                // if it cared. This mirrors the original lua script's
                // best-effort behavior when esplora_tx is unavailable.
                spendable.push({
                  txid: u.txid,
                  vout: u.vout,
                  value: u.value,
                  outpoint: `${u.txid}:${u.vout}`,
                  height,
                  confirmations,
                  is_coinbase: false,
                });
              }
              result = {
                spendable,
                immature,
                currentHeight: tipHeight ?? 0,
                address,
              };
            }
            data = { jsonrpc: '2.0', result, id: body?.id ?? null };
          }
        } catch (e) {
          console.warn(`[RPC Proxy] mempool.space fallback failed:`, e);
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
