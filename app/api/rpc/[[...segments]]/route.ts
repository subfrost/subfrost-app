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
 * JOURNAL ENTRY (2026-02-11): Espo-first for protorunesbyaddress.
 * Metashrew times out at 60s for heavy addresses; espo responds in ~100ms.
 * The proxy now calls espo FIRST and only falls through to metashrew if
 * espo fails. Protobuf encoding verified against alkanes-rs provider.rs:
 *   - BalanceSheetItem.balance is type `uint128` (protobuf message with lo/hi)
 *   - RuneId height/txindex are type `uint128` (message), NOT uint32 varints
 *   - OutpointResponse.output (field 3) is REQUIRED by SDK (ok_or_else + ?)
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

/** Encode a bigint as a protobuf uint128 message: { uint64 lo = 1; uint64 hi = 2; }
 *  The proto schema defines: `message uint128 { uint64 lo = 1; uint64 hi = 2; }`
 *  Used for BalanceSheetItem.balance AND RuneId height/txindex fields.
 *  The WASM SDK (provider.rs) decodes these as prost Uint128 structs and
 *  accesses .lo — confirmed by: `balance.lo as u128`, `height.lo as u128`. */
function encodeUint128Bytes(value: bigint): Buffer {
  const lo = value & ((1n << 64n) - 1n);
  const hi = value >> 64n;
  const parts: Buffer[] = [];
  // field 1 (lo) — always include even if 0 so decoder sees the field
  parts.push(encodeVF(1, lo));
  // field 2 (hi) — omit if 0 to save bytes
  if (hi > 0n) parts.push(encodeVF(2, hi));
  return Buffer.concat(parts);
}

/** RuneId: { uint128 height = 1; uint128 txindex = 2; }
 *  The WASM SDK (provider.rs) decodes rune_id.height as Option<Uint128> and
 *  accesses .lo — so both fields are uint128 sub-messages, NOT plain uint32 varints.
 *  Encoding as varints caused wrong wire type → fields skipped → balance entries
 *  silently dropped → "have 0". */
function encodeRuneId(block: number, tx: number): Buffer {
  return Buffer.concat([
    encodeLD(1, encodeUint128Bytes(BigInt(block))),
    encodeLD(2, encodeUint128Bytes(BigInt(tx))),
  ]);
}

/** Rune: { RuneId runeId = 1; bytes name = 2; ... } — minimal, just runeId */
function encodeRune(block: number, tx: number): Buffer {
  return encodeLD(1, encodeRuneId(block, tx));
}

/** BalanceSheetItem: { Rune rune = 1; uint128 balance = 2; } */
function encodeBalanceSheetItem(block: number, tx: number, amount: bigint): Buffer {
  return Buffer.concat([
    encodeLD(1, encodeRune(block, tx)),
    encodeLD(2, encodeUint128Bytes(amount)),
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

/** Output: { bytes script = 1; uint64 value = 2; }
 *  The SDK REQUIRES this field (provider.rs: item.output.ok_or_else()?).
 *  Without it, the entire parse fails → no outpoints → "have 0". */
function encodeOutput(script: Buffer, value: number): Buffer {
  return Buffer.concat([
    encodeLD(1, script),
    encodeVF(2, value),
  ]);
}

// ---------------------------------------------------------------------------
// Minimal bech32/bech32m decoder for address → scriptPubKey conversion
// Needed to populate the Output.script field from the request address.
// ---------------------------------------------------------------------------
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Decode(addr: string): { version: number; program: Buffer } | null {
  const lower = addr.toLowerCase();
  const sepIdx = lower.lastIndexOf('1');
  if (sepIdx < 1) return null;

  const data: number[] = [];
  for (let i = sepIdx + 1; i < lower.length; i++) {
    const c = BECH32_CHARSET.indexOf(lower[i]);
    if (c < 0) return null;
    data.push(c);
  }

  // Remove 6-char checksum, first value is witness version
  const values = data.slice(0, -6);
  if (values.length < 1) return null;
  const version = values[0];

  // Convert 5-bit groups to 8-bit bytes
  let acc = 0, bits = 0;
  const program: number[] = [];
  for (let i = 1; i < values.length; i++) {
    acc = (acc << 5) | values[i];
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      program.push((acc >> bits) & 0xff);
    }
  }

  return { version, program: Buffer.from(program) };
}

/** Convert a bech32/bech32m address to its witness scriptPubKey.
 *  bc1q... (v0) → OP_0 <20 bytes>   (P2WPKH)
 *  bc1p... (v1) → OP_1 <32 bytes>   (P2TR) */
function addressToScript(addr: string): Buffer {
  const decoded = bech32Decode(addr);
  if (!decoded) {
    // Fallback: 34-byte P2TR placeholder (OP_1 + 32 zero bytes)
    const placeholder = Buffer.alloc(34);
    placeholder[0] = 0x51; // OP_1
    placeholder[1] = 0x20; // PUSH32
    return placeholder;
  }
  const { version, program } = decoded;
  const opN = version === 0 ? 0x00 : 0x50 + version;
  return Buffer.concat([Buffer.from([opN, program.length]), program]);
}

/** OutpointResponse: { BalanceSheet balances = 1; Outpoint outpoint = 2; Output output = 3; }
 *  Field 3 (Output) is REQUIRED by the SDK — without it, ok_or_else returns an error
 *  and the entire protorunesbyaddress parse fails. */
function encodeOutpointResponse(
  txidHex: string,
  vout: number,
  entries: { block: number; tx: number; amount: bigint }[],
  outputScript: Buffer,
  outputValue: number,
): Buffer {
  return Buffer.concat([
    encodeLD(1, encodeBalanceSheet(entries)),
    encodeLD(2, encodeOutpoint(txidHex, vout)),
    encodeLD(3, encodeOutput(outputScript, outputValue)),
  ]);
}

/** WalletResponse: { repeated OutpointResponse outpoints = 1; BalanceSheet balances = 2; }
 *  Field 2 (balances) is the AGGREGATED balance across all outpoints.
 *  The SDK reads field 1 (outpoints) for UTXO selection, and field 2 for totals. */
function encodeWalletResponse(
  outpoints: { txid: string; vout: number; entries: { block: number; tx: number; amount: bigint }[] }[],
  address: string,
): Buffer {
  // Derive scriptPubKey from the address for Output field (field 3 of OutpointResponse)
  const outputScript = addressToScript(address);
  // Alkane UTXOs typically carry 546 sats (dust limit). The SDK uses this for
  // TxOut.value but with lock_alkanes=true these UTXOs aren't spent as BTC.
  const ALKANE_UTXO_VALUE = 546;

  // Field 1: repeated OutpointResponse (each includes Output so SDK doesn't error)
  const outpointBufs = outpoints.map(op =>
    encodeLD(1, encodeOutpointResponse(op.txid, op.vout, op.entries, outputScript, ALKANE_UTXO_VALUE))
  );

  // Field 2: aggregated BalanceSheet (sum amounts per alkane across all outpoints)
  const totals = new Map<string, { block: number; tx: number; amount: bigint }>();
  for (const op of outpoints) {
    for (const e of op.entries) {
      const key = `${e.block}:${e.tx}`;
      const existing = totals.get(key);
      if (existing) {
        existing.amount += e.amount;
      } else {
        totals.set(key, { block: e.block, tx: e.tx, amount: e.amount });
      }
    }
  }
  const aggregated = encodeBalanceSheet(Array.from(totals.values()));

  return Buffer.concat([...outpointBufs, encodeLD(2, aggregated)]);
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
    console.log(`[RPC Proxy] Espo raw response keys:`, Object.keys(espoData?.result || {}));
    const outpoints = espoData?.result?.outpoints;
    if (!Array.isArray(outpoints)) {
      console.log(`[RPC Proxy] Espo: outpoints is not array, result:`, JSON.stringify(espoData?.result)?.slice(0, 500));
      return null;
    }

    // Log a sample outpoint to debug field names
    const withEntries = outpoints.filter((op: any) => op.entries?.length > 0);
    console.log(`[RPC Proxy] Espo: ${outpoints.length} total outpoints, ${withEntries.length} with entries`);
    if (withEntries.length > 0) {
      console.log(`[RPC Proxy] Espo sample outpoint:`, JSON.stringify(withEntries[0]));
    } else if (outpoints.length > 0) {
      console.log(`[RPC Proxy] Espo sample (no entries):`, JSON.stringify(outpoints[0]));
    }

    // Convert espo outpoints to protobuf WalletResponse
    const pbOutpoints = outpoints.map((op: any) => {
      const [txid, voutStr] = (op.outpoint as string).split(':');
      const entries = (op.entries || []).map((e: any) => {
        const [blockStr, txStr] = (e.alkane as string).split(':');
        return { block: parseInt(blockStr, 10), tx: parseInt(txStr, 10), amount: BigInt(e.amount) };
      });
      return { txid, vout: parseInt(voutStr, 10), entries };
    });

    const walletResponse = encodeWalletResponse(pbOutpoints, address);
    const totalAlkaneEntries = pbOutpoints.reduce((sum: number, op: any) => sum + op.entries.length, 0);
    console.log(`[RPC Proxy] Espo: encoded ${pbOutpoints.length} outpoints, ${totalAlkaneEntries} alkane entries for ${address}`);

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

    // -----------------------------------------------------------------------
    // FAST-PATH INTERCEPTS — eliminate multi-second waits
    // -----------------------------------------------------------------------

    if (!Array.isArray(body)) {
      // 1. metashrew_height → getblockcount (64ms instead of 6.7s)
      //    metashrew_height goes to the metashrew indexer which is extremely slow.
      //    getblockcount returns the same block height from bitcoind directly.
      if (body?.method === 'metashrew_height') {
        try {
          const blockResp = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'getblockcount', params: [], id: body.id ?? 1 }),
          });
          if (blockResp.ok) {
            const blockData = await blockResp.json();
            if (blockData?.result != null) {
              return NextResponse.json({
                jsonrpc: '2.0',
                result: String(blockData.result),
                id: body.id ?? 1,
              });
            }
          }
        } catch { /* fall through to normal path */ }
      }

      // 2. ord_output → instant empty response (~200ms × N calls saved)
      //    The ord JSON API is disabled on subfrost endpoints. Every call
      //    returns "JSON API disabled" after a 200ms round-trip. The SDK
      //    handles missing ord data gracefully — it just skips ordinal
      //    safety checks (acceptable for alkane sends).
      if (body?.method === 'ord_output') {
        return NextResponse.json({
          jsonrpc: '2.0',
          result: null,
          id: body.id ?? 1,
        });
      }
    }

    // -----------------------------------------------------------------------
    // ESPO-FIRST for protorunesbyaddress
    // Espo responds in ~100ms. Metashrew times out at 60s for heavy addresses.
    // Call espo first; only fall back to metashrew if espo fails.
    // -----------------------------------------------------------------------
    const isProtorunesByAddr =
      !Array.isArray(body) &&
      body?.method === 'metashrew_view' &&
      Array.isArray(body?.params) &&
      body.params[0] === 'protorunesbyaddress';

    if (isProtorunesByAddr) {
      const payloadHex = body.params[1] as string;
      const address = parseAddressFromPayload(payloadHex);
      console.log(`[RPC Proxy] >> protorunesbyaddress for ${address} (espo-first)`);

      if (address) {
        const baseUrl = (RPC_ENDPOINTS[network] || RPC_ENDPOINTS.regtest).replace(/\/$/, '');
        const espoUrl = `${baseUrl}/espo`;
        try {
          const espoResult = await espoProtorunesFallback(espoUrl, address, body.id ?? 1);
          if (espoResult) {
            console.log(`[RPC Proxy] << protorunesbyaddress served by espo for ${address}`);
            return NextResponse.json(espoResult);
          }
          console.warn(`[RPC Proxy] espo returned null for ${address}, falling through to metashrew`);
        } catch (err) {
          console.warn(`[RPC Proxy] espo failed for ${address}, falling through to metashrew:`, err);
        }
      }
      // If espo failed, fall through to normal metashrew path below
    }

    // -----------------------------------------------------------------------
    // Standard upstream fetch (metashrew / subfrost)
    // -----------------------------------------------------------------------
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

    return NextResponse.json(data);
  } catch (error) {
    console.error('[RPC Proxy] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'RPC proxy error' },
      { status: 500 }
    );
  }
}
