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
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
  'qubitcoin-regtest': 'https://meta.lake.direct',
  'subfrost-regtest': 'https://regtest.subfrost.io/v4/subfrost',
  oylnet: 'https://regtest.subfrost.io/v4/subfrost',
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

function pickEndpoint(body: any, network: string) {
  const isBatch = Array.isArray(body);
  const single = RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest;
  const batch = BATCH_RPC_ENDPOINTS[network] || BATCH_RPC_ENDPOINTS.regtest;
  return isBatch ? batch : single;
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
    const QBC_METASHREW = `http://${QBC_HOST}:31080`;
    const QBC_ESPLORA = `http://${QBC_HOST}:31050`;
    const QBC_JSONRPC = `http://${QBC_HOST}:31944`;
    const QBC_ESPO = `http://${QBC_HOST}:31578`;

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
    // Return a JSON-RPC error so the browser fetch interceptor can handle it instead.
    // regtest-local is a real backend (SSH-tunneled to metabot on localhost:18888) — forward it.
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

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // Read the response body once. Upstream is always JSON-RPC, but infrastructure
    // errors (nginx 502, rate limits, service unavailable) may return plain text or HTML.
    const responseText = await response.text();
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

    // ========================================================================
    // [JOURNAL 2026-04-26] HOSTED REGTEST ESPO ESSENTIALS WORKAROUND
    // Hosted regtest's espo essentials index doesn't populate alkane balances
    // (skips writes when the alkane trace return status isn't Success), so
    // `essentials.get_address_outpoints` and `get-alkanes-utxo` return empty
    // even when `alkanes_protorunesbyoutpoint` shows the balance correctly.
    // We synthesize the missing data from the canonical outpoint indexer.
    // Production (mainnet) is unaffected — populated responses skip the patch.
    // Permanent fix: espo essentials reading balances from protorunes_by_outpoint
    // (out of frontend scope). See docs/HOSTED_REGTEST_WORKAROUNDS.md.
    if (network === 'regtest') {
      const enriched = await enrichRegtestAlkaneData(method, body, data, segments);
      if (enriched) return NextResponse.json(enriched);
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

// ============================================================================
// Hosted regtest enrichment helpers (see [JOURNAL 2026-04-26] block above)
// ============================================================================

type ProtoruneOutpoint = {
  outpoint: { txid: string; vout: number };
  output: { value: number };
  height?: number;
  txindex?: number;
  balance_sheet?: {
    cached?: { balances?: Array<{ amount: number; block: number; tx: number }> };
  };
};

/**
 * Query `alkanes_protorunesbyaddress` on hosted regtest for the given address.
 * Returns the outpoint list with their balance sheets, or null on any error.
 *
 * Uses the canonical outpoint-keyed indexer which DOES populate correctly on
 * hosted regtest (verified via curl for tx 689b151e... at vout 1).
 */
async function fetchProtorunesByAddress(address: string): Promise<ProtoruneOutpoint[] | null> {
  try {
    const resp = await fetch('https://regtest.subfrost.io/v4/subfrost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_protorunesbyaddress',
        params: [{ address, protocolTag: '1' }],
        id: 1,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const outpoints = j?.result?.outpoints;
    if (!Array.isArray(outpoints)) return null;
    return outpoints as ProtoruneOutpoint[];
  } catch {
    return null;
  }
}

/**
 * Returns an enriched response object iff the request is one of the broken
 * espo endpoints AND the response is missing the alkane data we know exists.
 * Returns null otherwise (caller should pass through the original response).
 */
async function enrichRegtestAlkaneData(
  method: string | undefined,
  body: any,
  data: any,
  segments: string[] | undefined,
): Promise<any | null> {
  // Path-based REST: /api/rpc/regtest/get-alkanes-utxo
  const restPath = segments && segments.length > 1 ? segments.slice(1).join('/') : '';

  if (restPath === 'get-alkanes-utxo' && body?.address && Array.isArray(data?.data)) {
    return await enrichGetAlkanesUtxo(body.address as string, data);
  }

  // Path-based JSON-RPC: /api/rpc/regtest/espo  with method essentials.get_address_outpoints
  if (restPath === 'espo' && body?.method === 'essentials.get_address_outpoints') {
    const address = body?.params?.address as string | undefined;
    if (!address) return null;

    const result = data?.result;
    const currentOutpoints = Array.isArray(result?.outpoints) ? result.outpoints : null;
    if (currentOutpoints === null) return null;
    if (currentOutpoints.length > 0) return null; // already populated, no enrichment needed

    return await synthesizeAddressOutpoints(address, body?.id ?? 1);
  }

  return null;
}

/**
 * Enrich the `get-alkanes-utxo` REST response by filling in `alkanes` per UTXO
 * from `alkanes_protorunesbyaddress`. The original response already contains
 * the correct UTXO list (txid/vout/satoshis/scriptPk) — we just need to fix
 * the empty `alkanes: {}` field for outpoints that actually carry alkanes.
 *
 * Skips enrichment if every UTXO already has a populated `alkanes` map (which
 * would indicate the index is healthy — preserves production behavior).
 */
async function enrichGetAlkanesUtxo(address: string, data: any): Promise<any | null> {
  const utxos = data.data as Array<any>;
  const allEmpty = utxos.every(
    u => !u.alkanes || (typeof u.alkanes === 'object' && Object.keys(u.alkanes).length === 0),
  );
  if (!allEmpty) return null; // some entries have alkane data already — index is healthy, leave alone

  const protorunes = await fetchProtorunesByAddress(address);
  if (!protorunes || protorunes.length === 0) return null;

  // Build {`txid:vout` → {alkaneId: { name, symbol, value }}} map from protorune data.
  //
  // [JOURNAL 2026-04-26] Production (mainnet) returns the rich shape:
  //   "alkanes": { "32:0": { "name": "frBTC", "symbol": "FRBTC", "value": "9950" } }
  // We mirror that shape exactly so the SDK consumes a uniform format across
  // networks. Verified hand-spot against mainnet curl response.
  // For unknown alkaneIds we leave name/symbol empty — SDK either has cached
  // metadata from elsewhere or treats it as unknown.
  const KNOWN_ALKANE_META: Record<string, { name: string; symbol: string }> = {
    '32:0': { name: 'frBTC', symbol: 'FRBTC' },
    '2:0': { name: 'DIESEL', symbol: 'DIESEL' },
  };
  const balanceMap = new Map<string, Record<string, any>>();
  for (const op of protorunes) {
    const txid = op.outpoint?.txid;
    const vout = op.outpoint?.vout;
    if (!txid || vout === undefined) continue;
    const balances = op.balance_sheet?.cached?.balances;
    if (!Array.isArray(balances) || balances.length === 0) continue;
    const alkanesField: Record<string, any> = {};
    for (const b of balances) {
      const id = `${b.block}:${b.tx}`;
      const meta = KNOWN_ALKANE_META[id] || { name: '', symbol: '' };
      alkanesField[id] = {
        name: meta.name,
        symbol: meta.symbol,
        value: String(b.amount),
      };
    }
    balanceMap.set(`${txid}:${vout}`, alkanesField);
  }

  if (balanceMap.size === 0) return null;

  // Merge balance data into the original UTXO list. We also need to surface
  // any outpoints from protorunes that aren't in the existing UTXO list (the
  // SDK iterates through `data` looking for alkane carriers, so missing
  // entries means missing alkanes from the SDK's view).
  const seenOutpoints = new Set<string>();
  const enrichedUtxos = utxos.map(u => {
    const key = `${u.txId}:${u.outputIndex}`;
    seenOutpoints.add(key);
    const alkanes = balanceMap.get(key);
    if (!alkanes) return u;
    return { ...u, alkanes };
  });

  // Add any protorune-known outpoints that weren't in the esplora UTXO list.
  // This shouldn't happen often (esplora usually has them), but it's the
  // safety net that makes "Insufficient alkanes have 0" go away.
  for (const [key, alkanes] of balanceMap) {
    if (seenOutpoints.has(key)) continue;
    const [txId, voutStr] = key.split(':');
    const vout = parseInt(voutStr, 10);
    // We don't know satoshis/scriptPk without an esplora lookup, but the
    // SDK's UTXO selection only needs txid/vout/alkanes for alkane-input
    // discovery. Fill with conservative defaults; if this synthetic entry is
    // selected, the SDK will fetch the txout details separately.
    enrichedUtxos.push({
      address,
      alkanes,
      confirmations: 1,
      indexed: true,
      inscriptions: [],
      outputIndex: vout,
      runes: {},
      satoshis: 546, // alkane dust default; SDK reads this from witnessUtxo separately
      scriptPk: '',
      txId,
    });
  }

  console.log(
    `[RPC Proxy] [regtest enrich get-alkanes-utxo] ${address.slice(0, 12)}…: ` +
      `${utxos.length} UTXOs, ${balanceMap.size} carry alkanes (${enrichedUtxos.length - utxos.length} synthesized)`,
  );

  return { ...data, data: enrichedUtxos };
}

/**
 * Synthesize an `essentials.get_address_outpoints` response from
 * `alkanes_protorunesbyaddress` data. Mirrors the response shape espo would
 * return if its essentials index were populated.
 */
async function synthesizeAddressOutpoints(address: string, id: any): Promise<any | null> {
  const protorunes = await fetchProtorunesByAddress(address);
  if (!protorunes || protorunes.length === 0) return null;

  const outpoints: any[] = [];
  for (const op of protorunes) {
    const txid = op.outpoint?.txid;
    const vout = op.outpoint?.vout;
    if (!txid || vout === undefined) continue;
    const balances = op.balance_sheet?.cached?.balances;
    if (!Array.isArray(balances) || balances.length === 0) continue;
    const entries = balances.map(b => ({
      alkane: `${b.block}:${b.tx}`,
      amount: String(b.amount),
    }));
    outpoints.push({
      outpoint: `${txid}:${vout}`,
      entries,
    });
  }

  if (outpoints.length === 0) return null;

  console.log(
    `[RPC Proxy] [regtest enrich essentials.get_address_outpoints] ${address.slice(0, 12)}…: ` +
      `synthesized ${outpoints.length} outpoints`,
  );

  return {
    jsonrpc: '2.0',
    result: { address, ok: true, outpoints },
    id,
  };
}
