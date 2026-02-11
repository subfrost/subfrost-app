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
 * JOURNAL ENTRY (2026-02-11): Added espo fallback for metashrew_view
 * protorunesbyaddress. When the metashrew service is unreachable, the proxy
 * calls espo's essentials.get_address_outpoints and encodes the result as
 * the protobuf WalletResponse the SDK expects.
 */

import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Minimal protobuf encoder for WalletResponse (protorunesbyaddress fallback)
// Proto schema: https://github.com/kungfuflex/protorune/blob/master/proto/protorune.proto
// ---------------------------------------------------------------------------

/** Encode an unsigned integer as a protobuf varint */
function encodeVarint(value: number | bigint): Buffer {
  const bytes: number[] = [];
  let v = typeof value === 'bigint' ? value : BigInt(value);
  if (v === 0n) { bytes.push(0); return Buffer.from(bytes); }
  while (v > 0n) {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}

/** Encode a length-delimited protobuf field (field_num, wire_type=2, length, data) */
function encodeLD(fieldNum: number, data: Buffer): Buffer {
  const tag = encodeVarint(fieldNum << 3 | 2);
  const len = encodeVarint(data.length);
  return Buffer.concat([tag, len, data]);
}

/** Encode a varint protobuf field (field_num, wire_type=0, value) */
function encodeVF(fieldNum: number, value: number | bigint): Buffer {
  const tag = encodeVarint(fieldNum << 3 | 0);
  return Buffer.concat([tag, encodeVarint(value)]);
}

/** uint128 message: { uint64 lo = 1; uint64 hi = 2; } */
function encodeUint128(value: bigint): Buffer {
  const lo = value & ((1n << 64n) - 1n);
  const hi = value >> 64n;
  const parts: Buffer[] = [];
  if (lo > 0n) parts.push(encodeVF(1, lo));
  if (hi > 0n) parts.push(encodeVF(2, hi));
  return Buffer.concat(parts);
}

/** RuneId: { uint128 height = 1; uint128 txindex = 2; } */
function encodeRuneId(block: number, tx: number): Buffer {
  const parts: Buffer[] = [];
  parts.push(encodeLD(1, encodeUint128(BigInt(block))));
  // Always include txindex (even if 0) — SDK expects it present
  parts.push(encodeLD(2, encodeUint128(BigInt(tx))));
  return Buffer.concat(parts);
}

/** Rune: { RuneId runeId = 1; bytes name = 2; ... } — minimal, just runeId */
function encodeRune(block: number, tx: number): Buffer {
  return encodeLD(1, encodeRuneId(block, tx));
}

/** BalanceSheetItem: { Rune rune = 1; bytes balance = 2; } */
function encodeBalanceSheetItem(block: number, tx: number, amount: bigint): Buffer {
  return Buffer.concat([
    encodeLD(1, encodeRune(block, tx)),
    encodeLD(2, encodeUint128(amount)),
  ]);
}

/** BalanceSheet: { repeated BalanceSheetItem entries = 1; } */
function encodeBalanceSheet(entries: { block: number; tx: number; amount: bigint }[]): Buffer {
  return Buffer.concat(entries.map(e => encodeLD(1, encodeBalanceSheetItem(e.block, e.tx, e.amount))));
}

/** Outpoint: { bytes txid = 1; uint32 vout = 2; } — txid is byte-reversed */
function encodeOutpoint(txidHex: string, vout: number): Buffer {
  // Reverse txid from display order (big-endian) to internal (little-endian)
  const txidBuf = Buffer.from(txidHex, 'hex').reverse();
  const parts: Buffer[] = [encodeLD(1, txidBuf)];
  if (vout > 0) parts.push(encodeVF(2, vout));
  return Buffer.concat(parts);
}

/** OutpointResponse: { BalanceSheet balances = 1; Outpoint outpoint = 2; } */
function encodeOutpointResponse(
  txidHex: string,
  vout: number,
  entries: { block: number; tx: number; amount: bigint }[]
): Buffer {
  return Buffer.concat([
    encodeLD(1, encodeBalanceSheet(entries)),
    encodeLD(2, encodeOutpoint(txidHex, vout)),
  ]);
}

/** WalletResponse: { repeated OutpointResponse outpoints = 1; } */
function encodeWalletResponse(
  outpoints: { txid: string; vout: number; entries: { block: number; tx: number; amount: bigint }[] }[]
): Buffer {
  return Buffer.concat(outpoints.map(op => encodeLD(1, encodeOutpointResponse(op.txid, op.vout, op.entries))));
}

/**
 * Parse the address from a protorunesbyaddress protobuf request payload.
 * ProtorunesWalletRequest: { bytes wallet = 1; bytes protocol_tag = 2; }
 * The wallet field contains the address as a UTF-8 string.
 */
function parseAddressFromPayload(hexPayload: string): string | null {
  try {
    const hex = hexPayload.startsWith('0x') ? hexPayload.slice(2) : hexPayload;
    const buf = Buffer.from(hex, 'hex');
    // Field 1 (wallet): tag=0x0a, then varint length, then UTF-8 bytes
    if (buf[0] !== 0x0a) return null;
    let offset = 1;
    let len = 0, shift = 0;
    while (offset < buf.length) {
      const byte = buf[offset++];
      len |= (byte & 0x7f) << shift;
      shift += 7;
      if (!(byte & 0x80)) break;
    }
    return buf.slice(offset, offset + len).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Espo fallback for metashrew_view protorunesbyaddress.
 * Calls essentials.get_address_outpoints via espo and encodes the result
 * as a protobuf WalletResponse hex string.
 */
async function espoProtorunesFallback(
  espoUrl: string,
  address: string,
  requestId: number | string
): Promise<object | null> {
  try {
    const espoResp = await fetch(espoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'essentials.get_address_outpoints',
        params: { address },
        id: 1,
      }),
    });
    if (!espoResp.ok) return null;

    const espoData = await espoResp.json();
    const outpoints = espoData?.result?.outpoints;
    if (!Array.isArray(outpoints)) return null;

    // Convert espo outpoints to protobuf WalletResponse
    const pbOutpoints = outpoints.map((op: any) => {
      const [txid, voutStr] = (op.outpoint as string).split(':');
      const entries = (op.entries || []).map((e: any) => {
        const [blockStr, txStr] = (e.alkane as string).split(':');
        return { block: parseInt(blockStr, 10), tx: parseInt(txStr, 10), amount: BigInt(e.amount) };
      });
      return { txid, vout: parseInt(voutStr, 10), entries };
    });

    const walletResponse = encodeWalletResponse(pbOutpoints);
    console.log(`[RPC Proxy] Espo fallback: encoded ${pbOutpoints.length} outpoints for ${address}`);

    return {
      jsonrpc: '2.0',
      result: '0x' + walletResponse.toString('hex'),
      id: requestId,
    };
  } catch (err) {
    console.error('[RPC Proxy] Espo fallback failed:', err);
    return null;
  }
}

// All RPC endpoints point to subfrost infrastructure
const RPC_ENDPOINTS: Record<string, string> = {
  mainnet: 'https://mainnet.subfrost.io/v4/subfrost',
  testnet: 'https://testnet.subfrost.io/v4/subfrost',
  signet: 'https://signet.subfrost.io/v4/subfrost',
  regtest: 'https://regtest.subfrost.io/v4/subfrost',
  'regtest-local': 'http://localhost:18888',
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

    if (segments && segments.length > 0) {
      // Path-based: /api/rpc/mainnet  or  /api/rpc/mainnet/get-alkanes-by-address
      const [networkSegment, ...restPath] = segments;
      network = networkSegment;

      if (restPath.length > 0) {
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

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `RPC request failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // --- Espo fallback for metashrew_view protorunesbyaddress ---
    // When the subfrost backend's metashrew service is unreachable, the SDK's
    // internal protorunesbyaddress call fails and it thinks the wallet has 0
    // alkanes ("Insufficient alkanes"). Espo has the same data indexed and
    // available. We detect the failure and re-encode the espo response as the
    // protobuf WalletResponse the SDK expects.
    if (
      data?.error &&
      !Array.isArray(body) &&
      body?.method === 'metashrew_view' &&
      Array.isArray(body?.params) &&
      body.params[0] === 'protorunesbyaddress'
    ) {
      const payloadHex = body.params[1] as string;
      const address = parseAddressFromPayload(payloadHex);
      if (address) {
        console.log(`[RPC Proxy] metashrew_view failed for ${address}, trying espo fallback...`);
        const baseUrl = (RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest).replace(/\/$/, '');
        const espoUrl = `${baseUrl}/espo`;
        const fallback = await espoProtorunesFallback(espoUrl, address, body.id ?? 1);
        if (fallback) {
          return NextResponse.json(fallback);
        }
        console.warn('[RPC Proxy] Espo fallback returned null, returning original error');
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
