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

import { SUBFROST_API_URLS, getRpcUrl } from '@/utils/getConfig';

// ============================================================================
// Shared fetch helpers
// ============================================================================

/**
 * Resolves the subfrost JSON-RPC endpoint for a given network name.
 * Accepts the same network strings as `getRpcUrl` / `SUBFROST_API_URLS`.
 */
function subfrostRpcUrl(network: string): string {
  return SUBFROST_API_URLS[network] || SUBFROST_API_URLS.mainnet;
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

/**
 * Hedged retry: start source A; if unresolved after `hedgeMs`, race source B.
 * First successful result wins; losers are left to resolve in the background
 * (no abort — fetch without signal is fire-and-forget and short enough to drop).
 *
 * Use when one source is authoritative but slow, and a second is a cheap hedge.
 * For multi-source fan-out where all sources are equivalent, use `Promise.any`.
 */
async function hedged<T>(
  primary: (signal: AbortSignal) => Promise<T>,
  fallback: (signal: AbortSignal) => Promise<T>,
  hedgeMs: number,
  signal?: AbortSignal,
): Promise<T> {
  const primaryCtrl = new AbortController();
  const fallbackCtrl = new AbortController();
  if (signal) {
    signal.addEventListener('abort', () => {
      primaryCtrl.abort();
      fallbackCtrl.abort();
    });
  }

  const primaryP = primary(primaryCtrl.signal);
  let fallbackStarted = false;

  const delay = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('hedge timeout')), hedgeMs);
  });

  try {
    // Either primary resolves in time, or we race it against the fallback.
    return await Promise.race([primaryP, delay]);
  } catch {
    fallbackStarted = true;
    const fallbackP = fallback(fallbackCtrl.signal);
    const winner = await Promise.any([primaryP, fallbackP]);
    return winner;
  } finally {
    // Best-effort cleanup. The losing request will still complete server-side
    // but its response is discarded.
    if (fallbackStarted) primaryCtrl.abort();
  }
}

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
// Block height — hedged over multiple sources
// ============================================================================

/**
 * Returns the current metashrew height for a network.
 *
 * Tries `metashrew_height` primary, `esplora_blocks::tip-height` after 2 s.
 * Matches the fallback cascade already in `queries/height.ts` but using
 * direct fetch instead of WASM-wrapped calls.
 */
export async function getHeight(network: string, signal?: AbortSignal): Promise<number> {
  const url = subfrostRpcUrl(network);
  return hedged(
    (s) => jsonRpcCall<number | string>(url, 'metashrew_height', [], s).then(Number),
    (s) => jsonRpcCall<number | string>(url, 'esplora_blocks::tip-height', [], s).then(Number),
    2000,
    signal,
  );
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
    'esplora_tx::broadcast',
    [txHex],
    signal,
  );
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
  return jsonRpcCall<string>(
    subfrostRpcUrl(network),
    'metashrew_view',
    [viewFn, hexParams, blockTag],
    signal,
  );
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

/**
 * Fetch all token pairs discoverable from the app's own REST proxy.
 * Routes through `/api/rpc/{network}/get-all-token-pairs` (existing app endpoint).
 *
 * The upstream REST endpoint expects a body `{ factoryId: { block, tx } }`.
 * `factoryId` is passed as `"block:tx"` and split internally.
 *
 * Hedged with `getAllAmmPools` since that returns the same information in a
 * different shape. Normalized here so callers can `.pools` directly.
 */
export async function getTokenPairs(
  network: string,
  factoryId: string,
  signal?: AbortSignal,
): Promise<Record<string, AmmPoolData>> {
  const [block, tx] = factoryId.split(':');
  // Primary: REST endpoint the app already maintains. Fast on subfrost networks.
  const primary = async (s: AbortSignal) => {
    const res = await fetch(`${getRpcUrl(network)}/get-all-token-pairs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factoryId: { block, tx } }),
      signal: s,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    // Normalize whatever shape the server returned into `ammdata.get_pools` format.
    if (json?.pools) return json.pools as Record<string, AmmPoolData>;
    if (json?.result?.pools) return json.result.pools as Record<string, AmmPoolData>;
    if (Array.isArray(json?.data)) {
      const out: Record<string, AmmPoolData> = {};
      for (const pair of json.data) {
        if (pair?.pool_id) out[pair.pool_id] = pair;
      }
      return out;
    }
    throw new Error('Unknown token-pairs response shape');
  };

  // Fallback: alkanode's mainnet dataset. Third-party — only useful on mainnet.
  const fallback = async (s: AbortSignal) => {
    const all = await getAllAmmPools(s);
    return all.pools;
  };

  return hedged(primary, fallback, 2000, signal);
}

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
 * Fetch metadata for a single alkane (name / symbol / decimals).
 * Uses the app's existing `/api/token-details` route.
 */
export async function getAlkaneInfo(
  network: string,
  alkaneId: string,
  signal?: AbortSignal,
): Promise<AlkaneInfo | null> {
  const res = await fetch(`/api/token-details`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network, alkaneIds: [alkaneId] }),
    signal,
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json?.tokens?.[alkaneId]) {
    return { alkaneId, ...json.tokens[alkaneId] };
  }
  if (Array.isArray(json?.tokens)) {
    return json.tokens.find((t: AlkaneInfo) => t.alkaneId === alkaneId) ?? null;
  }
  return null;
}
