/**
 * Thin fetch layer that replaces the ~100 WASM `provider.*` HTTP-wrapper methods.
 *
 * Every function here is pure JSON-RPC over fetch. The `alkanes-jsonrpc` server
 * (subfrost.io) decodes the protobuf server-side for `alkanes_simulate` and
 * `alkanes_protorunesbyaddress`, so browsers receive plain JSON — no protobuf
 * schemas needed on the client.
 *
 * Design rules:
 * - Every function accepts an optional `AbortSignal` and threads it to fetch.
 * - Every function is a single round-trip. Parallel fan-out is caller's choice.
 * - Response shapes MATCH the SDK's `provider.*` output so callers swap in-place.
 * - No WASM dependency. This module is safe to load on read-only pages.
 * - No JSON-RPC array batching (server rejects with `"invalid type: map"`).
 *   Use Promise.all at call sites instead.
 *
 * AUDIT 2026-04-18 — endpoint verification:
 * - `alkanes_simulate` on mainnet/regtest → returns decoded JSON (not hex). ✅
 * - `alkanes_protorunesbyaddress` on mainnet/regtest → returns decoded JSON. ✅
 * - `/v4/api/get-reserves` → 404 on live networks. ❌ Use api.alkanode.com/rpc.
 * - `/v4/subfrost/get-pool-details` → 422 (needs factoryId). Kept as fallback.
 * - `api.alkanode.com/rpc` `ammdata.get_pools` → works for mainnet pool data. ✅
 */

import { getRpcUrl } from '@/utils/getConfig';

// ============================================================================
// Shared fetch helpers
// ============================================================================

/**
 * The single browser-facing JSON-RPC endpoint for a network.
 *
 * Per flex 2026-05-11 ("we should never have more than 1 way to do
 * something"), every browser-side RPC call funnels through the
 * same-origin Next.js proxy at /api/rpc/${network} regardless of method.
 * The proxy is the only place that knows the subfrost.io routing matrix
 * (`metashrew_view` + `metashrew_height` → /v6/subfrost; everything else
 * → /v4 gateway; REST sub-paths → canon Espo on alkanode). Letting each
 * helper pick its own upstream resurrects the routing-bug parade PR #116
 * deleted.
 *
 * History: this used to point straight at SUBFROST_API_URLS[network],
 * which on mainnet is /v4/<token>. That path was returning
 * `error sending request for url (http://metashrew-unwrap:8080/)` for
 * `metashrew_height` on 2026-05-11, which broke the swap quote engine
 * end-to-end (PR #116):
 *   simulateContract → getHeight → POST /v4 → JSON-RPC error →
 *   throw → fetchLivePoolState returns null → usePoolStateLive returns
 *   null → useSwapQuotes can't compute a quote → user sees "no quote".
 * Routing through /api/rpc lets the proxy isolate that failure mode.
 */
function subfrostRpcUrl(network: string): string {
  return getRpcUrl(network);
}

/**
 * POST a JSON-RPC request, throw on HTTP error, return parsed `.result`.
 * Throws `JsonRpcError` with `.code` + `.message` on RPC-level errors.
 */
export class JsonRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(`[JSON-RPC ${code}] ${message}`);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;
  }
}

async function jsonRpcCall<T = unknown>(
  url: string,
  method: string,
  params: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${method} @ ${url}`);
  }
  const body = await res.json();
  if (body?.error) {
    throw new JsonRpcError(
      body.error.code ?? -1,
      body.error.message ?? 'Unknown JSON-RPC error',
      body.error.data,
    );
  }
  return body.result as T;
}

// `hedged` removed 2026-05-11. Its only callers (`getHeight` and
// `getTokenPairs`) were stripped as part of the no-fallbacks pass —
// hedged retries hide the real upstream-failure mode and obscure which
// replica produced the answer. If you need cheap parallel fan-out across
// equivalent sources, use `Promise.any`. If you need fail-fast with one
// authoritative source, just call it directly and let the error bubble.

// ============================================================================
// alkanes_simulate — contract view calls
// ============================================================================

export interface AlkanesSimulateParams {
  /** AlkaneId "block:tx" of the target contract. */
  target: string;
  /** Cellpack inputs: [opcode, ...args] as string-encoded u128s. */
  inputs: string[];
  /** Token inputs for simulation context; defaults to empty. */
  alkanes?: Array<{ id: { block: string; tx: string }; value: string }>;
  /** Block tag (default "latest"). */
  blockTag?: string;
  /** Override height used by the simulator context. */
  height?: string;
  /** Transaction index inside the block (default 0). */
  txindex?: number;
  /** Vout index inside the transaction (default 0). */
  vout?: number;
}

export interface AlkanesSimulateResult {
  execution: {
    alkanes: unknown[];
    data: string; // "0x" + hex
    error: string | null;
    storage: unknown[];
  };
  gasUsed: number;
  status: number;
}

/**
 * Simulate a contract call. Server (`alkanes-jsonrpc`) handles protobuf encode
 * of the MessageContextParcel and decode of the response — we send/receive JSON.
 */
export async function alkanesSimulate(
  network: string,
  params: AlkanesSimulateParams,
  signal?: AbortSignal,
): Promise<AlkanesSimulateResult> {
  const body = {
    target: params.target,
    inputs: params.inputs,
    alkanes: params.alkanes ?? [],
    transaction: '0x',
    block: '0x',
    height: params.height ?? '1',
    txindex: params.txindex ?? 0,
    vout: params.vout ?? 0,
  };
  return jsonRpcCall<AlkanesSimulateResult>(
    subfrostRpcUrl(network),
    'alkanes_simulate',
    [body],
    signal,
  );
}

// ============================================================================
// alkanes_protorunesbyaddress — alkane balances + UTXOs for an address
// ============================================================================

export interface ProtoruneOutpointEntry {
  outpoint: { txid: string; vout: number };
  output: { value: number; script?: string };
  height?: number;
  balance_sheet?: {
    cached?: {
      balances: Array<{ block: number; tx: number; amount: number | string }>;
    };
  };
}

export interface ProtoruneWalletResponse {
  balances?: { entries?: unknown[] };
  outpoints: ProtoruneOutpointEntry[];
}

export async function getProtorunesByAddress(
  network: string,
  address: string,
  signal?: AbortSignal,
): Promise<ProtoruneWalletResponse> {
  return jsonRpcCall<ProtoruneWalletResponse>(
    subfrostRpcUrl(network),
    'alkanes_protorunesbyaddress',
    [{ address, protocolTag: '1' }],
    signal,
  );
}

// ============================================================================
// alkanes_protorunesbyoutpoint — alkane balances at a specific UTXO
// ============================================================================

export interface ProtoruneOutpointResponse {
  balance_sheet?: {
    cached?: {
      balances: Array<{ block: number; tx: number; amount: number | string }>;
    };
  };
  outpoint?: { txid: string; vout: number };
  output?: { value: number };
}

/**
 * Fetch alkane balances at a single (txid, vout). The wallet's
 * UTXO-derived balance fetch fans out across these in Promise.all.
 */
export async function getProtorunesByOutpoint(
  network: string,
  txid: string,
  vout: number,
  signal?: AbortSignal,
): Promise<ProtoruneOutpointResponse> {
  return jsonRpcCall<ProtoruneOutpointResponse>(
    subfrostRpcUrl(network),
    'alkanes_protorunesbyoutpoint',
    [{ txid, vout, protocolTag: '1' }],
    signal,
  );
}

// ============================================================================
// esplora_address::utxo — list UTXOs at an address
// ============================================================================

export interface EsploraUtxo {
  txid: string;
  vout: number;
  value: number;
  status?: { confirmed?: boolean; block_height?: number };
}

/**
 * List UTXOs at a Bitcoin address (confirmed + mempool). Some upstream
 * gateways return a string error sentinel (e.g.
 * "legacy address base58 string") in the JSON-RPC `result` field instead
 * of an array — handle that gracefully so callers always get a clean
 * `EsploraUtxo[]`.
 */
export async function getAddressUtxos(
  network: string,
  address: string,
  signal?: AbortSignal,
): Promise<EsploraUtxo[]> {
  const result = await jsonRpcCall<unknown>(
    subfrostRpcUrl(network),
    'esplora_address::utxo',
    [address],
    signal,
  );
  return Array.isArray(result) ? (result as EsploraUtxo[]) : [];
}

// ============================================================================
// esplora_address::txs:mempool — list mempool transactions for an address
// ============================================================================

export interface EsploraMempoolTx {
  txid: string;
  vin?: Array<{ txid: string; vout: number }>;
  vout?: Array<{ value: number; scriptpubkey_address?: string }>;
}

/**
 * List unconfirmed (mempool) transactions touching an address. Used by
 * the balance pipeline to filter out outpoints we've already spent in
 * our own pending transactions.
 */
export async function getAddressMempoolTxs(
  network: string,
  address: string,
  signal?: AbortSignal,
): Promise<EsploraMempoolTx[]> {
  const result = await jsonRpcCall<unknown>(
    subfrostRpcUrl(network),
    'esplora_address::txs:mempool',
    [address],
    signal,
  );
  return Array.isArray(result) ? (result as EsploraMempoolTx[]) : [];
}

// ============================================================================
// Block height
// ============================================================================

/**
 * Returns the current metashrew height for a network.
 *
 * Single upstream — `metashrew_height` against the proxy (which routes
 * to /v6/subfrost on mainnet, gateway on other networks). No hedge with
 * `esplora_blocks::tip-height`: per flex 2026-05-11 ("we should never
 * have more than 1 way to do something") fallbacks just hide the real
 * failure mode. If `metashrew_height` starts failing again, the proxy
 * is the right place to add an explicit retry, not this client helper.
 */
export async function getHeight(network: string, signal?: AbortSignal): Promise<number> {
  const url = subfrostRpcUrl(network);
  const result = await jsonRpcCall<number | string>(url, 'metashrew_height', [], signal);
  return Number(result);
}

// ============================================================================
// esplora_tx — fetch a transaction by txid (confirmation status, vouts, etc.)
// ============================================================================

export interface EsploraTransaction {
  txid: string;
  status?: { confirmed?: boolean; block_height?: number; block_hash?: string; block_time?: number };
  vin?: Array<{ txid: string; vout: number; prevout?: { value: number; scriptpubkey_address?: string } }>;
  vout?: Array<{ value: number; scriptpubkey?: string; scriptpubkey_address?: string }>;
  fee?: number;
  size?: number;
}

/**
 * Fetch a Bitcoin transaction by id. Returns null when the tx is not yet
 * known to the indexer (a typical state for a freshly-broadcast tx).
 */
export async function getEsploraTx(
  network: string,
  txid: string,
  signal?: AbortSignal,
): Promise<EsploraTransaction | null> {
  try {
    const result = await jsonRpcCall<EsploraTransaction>(
      subfrostRpcUrl(network),
      'esplora_tx',
      [txid],
      signal,
    );
    return result ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Broadcast transaction
// ============================================================================

/**
 * Broadcast a signed transaction hex string. Returns the txid string.
 */
export async function broadcastTransaction(
  network: string,
  txHex: string,
  signal?: AbortSignal,
): Promise<string> {
  return jsonRpcCall<string>(
    subfrostRpcUrl(network),
    'sendrawtransaction',
    [txHex],
    signal,
  );
}

/**
 * Broadcast a signed transaction package atomically via `submitpackage`.
 *
 * This is the ONLY supported atomic-package broadcast path. There is no
 * fallback to back-to-back `sendrawtransaction` calls — that would break
 * the CPFP parent+child atomicity guarantee that the ephemeral wrap-package
 * (`useEphemeralWrapPackage`) depends on. If the upstream node doesn't
 * implement `submitpackage` (-32601), the caller MUST surface the failure
 * loudly so we don't silently regress to the 2026-05-10 RBF-rejection
 * regime.
 */
export async function broadcastTransactions(
  network: string,
  txHexes: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const result = await jsonRpcCall<unknown>(
    subfrostRpcUrl(network),
    'submitpackage',
    [txHexes],
    signal,
  );

  if (Array.isArray(result)) {
    return result.map(String);
  }
  if (
    result &&
    typeof result === 'object' &&
    Array.isArray((result as { txids?: unknown[] }).txids)
  ) {
    return (result as { txids: unknown[] }).txids.map(String);
  }
  return [];
}

// ============================================================================
// metashrew_view — generic raw-view passthrough
// ============================================================================

/**
 * Low-level metashrew view call. Used by callers that need to issue a view
 * function not covered by the typed helpers above.
 *
 * Response is the raw result of the view — typically a hex string. Callers
 * must decode.
 */
export async function metashrewView(
  network: string,
  viewFn: string,
  hexParams: string,
  blockTag: string = 'latest',
  signal?: AbortSignal,
): Promise<string> {
  // Single upstream — the same-origin /api/rpc proxy. The proxy already
  // routes metashrew_view to /v6/subfrost on mainnet (sticky, fast) and
  // to the gateway on other networks. See subfrostRpcUrl above.
  return jsonRpcCall<string>(
    subfrostRpcUrl(network),
    'metashrew_view',
    [viewFn, hexParams, blockTag],
    signal,
  );
}

// ============================================================================
// Lua script evaluation
// ============================================================================

/**
 * Execute a Lua script via the metashrew node's `lua_evalscript` JSON-RPC
 * method. The server evaluates the script with the provided arguments and
 * returns whatever the script returns.
 *
 * Used for balance-aggregation + candle-backfill scripts that are too
 * expensive to run as protostone simulations. The script is hashed + cached
 * server-side, so repeated calls with the same script are O(1) dispatch.
 */
export async function luaEvalScript<T = unknown>(
  network: string,
  script: string,
  args: unknown[],
  signal?: AbortSignal,
): Promise<T> {
  const argsJson = JSON.stringify(args);
  const result = await jsonRpcCall<unknown>(
    subfrostRpcUrl(network),
    'lua_evalscript',
    [script, argsJson],
    signal,
  );
  return result as T;
}

// ============================================================================
// AMM pool data — via api.alkanode.com/rpc (third-party)
// ============================================================================

export interface AmmPoolData {
  base: string;
  base_reserve: string;
  quote: string;
  quote_reserve: string;
  source: string;
}

export interface AmmPoolsResponse {
  ok: boolean;
  page: number;
  limit: number;
  has_more: boolean;
  pools: Record<string, AmmPoolData>;
  total: number;
}

const ALKANODE_RPC_URL = 'https://api.alkanode.com/rpc';

/**
 * Fetch all AMM pools from the alkanode data service.
 *
 * Verified live: `/v4/api/get-reserves` returns 404 on every subfrost network;
 * `/v4/subfrost/get-pool-details` returns 422 (needs factoryId). `ammdata.get_pools`
 * at `api.alkanode.com/rpc` is the authoritative source for mainnet pool data
 * and is already what `alkanes-client.ts` falls through to today.
 *
 * NOTE: `api.alkanode.com` is a third-party service; treat as rate-limited even
 * though subfrost.io itself is unlimited. Prefer caching at call sites.
 */
export async function getAllAmmPools(signal?: AbortSignal): Promise<AmmPoolsResponse> {
  return jsonRpcCall<AmmPoolsResponse>(
    ALKANODE_RPC_URL,
    'ammdata.get_pools',
    {},
    signal,
  );
}

/**
 * Fetch reserves for a single pool. Filters `getAllAmmPools` client-side.
 */
export async function getPoolReserves(
  poolId: string,
  signal?: AbortSignal,
): Promise<AmmPoolData | null> {
  const all = await getAllAmmPools(signal);
  return all.pools?.[poolId] ?? null;
}

// ============================================================================
// Token pairs — for swap/pool discovery
// ============================================================================

export interface TokenPair {
  pool_id: string;
  token0: string;
  token1: string;
  reserve0?: string;
  reserve1?: string;
}

// Removed 2026-05-11: `getTokenPairs` had zero callers and used a hedged
// fallback chain (REST proxy primary, alkanode dataset fallback) that
// directly contradicts flex's "no fallbacks" rule. If you need pool
// discovery from the canonical alkanode dataset, call `getAllAmmPools`
// directly. If you need the per-network REST shape, route through the
// `/api/rpc/{network}/get-all-token-pairs` proxy URL — there is no
// app-wide use case for transparently switching between the two.

// ============================================================================
// BTC price + Alkane info — through existing Next.js API routes
// ============================================================================

export interface BtcPrice {
  usd: number;
  timestamp?: number;
}

export async function getBitcoinPrice(signal?: AbortSignal): Promise<BtcPrice> {
  const res = await fetch('/api/btc-price', { signal });
  if (!res.ok) throw new Error(`/api/btc-price HTTP ${res.status}`);
  return res.json();
}

export interface AlkaneInfo {
  alkaneId: string;
  name?: string;
  symbol?: string;
  decimals?: number;
}

/**
 * Fetch metadata for a batch of alkanes (name / symbol / decimals).
 * Uses the app's existing `/api/token-details` route. Returns a map
 * keyed by alkaneId; missing entries are omitted, errors swallowed
 * (returns empty map on transport failure).
 */
export async function getAlkaneInfoBatch(
  network: string,
  alkaneIds: string[],
  signal?: AbortSignal,
): Promise<Record<string, AlkaneInfo>> {
  if (alkaneIds.length === 0) return {};
  try {
    const res = await fetch(`/api/token-details`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ network, alkaneIds }),
      signal,
    });
    if (!res.ok) return {};
    const json = await res.json();
    const map: Record<string, AlkaneInfo> = {};
    // /api/token-details returns `{ names: { id: { name, symbol } } }`.
    // Also accept legacy `tokens` shapes (object map or array) for forward-compat.
    const objectMap =
      (json?.names && typeof json.names === 'object' && !Array.isArray(json.names) && json.names) ||
      (json?.tokens && typeof json.tokens === 'object' && !Array.isArray(json.tokens) && json.tokens) ||
      null;
    if (objectMap) {
      for (const [id, info] of Object.entries(objectMap as Record<string, Omit<AlkaneInfo, 'alkaneId'>>)) {
        map[id] = { alkaneId: id, ...info };
      }
    } else if (Array.isArray(json?.tokens)) {
      for (const t of json.tokens as AlkaneInfo[]) {
        if (t.alkaneId) map[t.alkaneId] = t;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Fetch metadata for a single alkane (name / symbol / decimals).
 * Convenience wrapper over `getAlkaneInfoBatch`.
 */
export async function getAlkaneInfo(
  network: string,
  alkaneId: string,
  signal?: AbortSignal,
): Promise<AlkaneInfo | null> {
  const map = await getAlkaneInfoBatch(network, [alkaneId], signal);
  return map[alkaneId] ?? null;
}
