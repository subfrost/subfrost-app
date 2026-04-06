/**
 * Fujin RPC helpers — ported from fuboku-app/lib/rpc-helpers.ts
 *
 * Provides contract simulation via metashrew_view("simulate") protobuf
 * and Espo Fujin JSON-RPC calls.
 */

/** Encode unsigned integer as LEB128 */
function encodeLEB128(value: number): number[] {
  const bytes: number[] = [];
  let val = value;
  do {
    let byte = val % 128;
    val = Math.floor(val / 128);
    if (val !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (val !== 0);
  return bytes;
}

/** Parse u128 from little-endian hex at given offset (in hex chars) */
export function parseU128LE(hexData: string, offset: number): bigint {
  const bytes = hexData.slice(offset, offset + 32);
  if (bytes.length !== 32) return 0n;
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    const byteHex = bytes.slice(i * 2, i * 2 + 2);
    const byte = parseInt(byteHex, 16);
    if (!isNaN(byte)) value |= BigInt(byte) << (BigInt(i) * 8n);
  }
  return value;
}

/** Decode a protobuf varint from hex string */
function decodeVarint(hex: string, pos: number): [number, number] {
  let value = 0, shift = 0, p = pos;
  while (p < hex.length) {
    const byte = parseInt(hex.slice(p, p + 2), 16);
    p += 2;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [value, p];
}

/**
 * Extract protobuf field 3 (tag 0x1a) data from simulate response.
 * This is where contract return data lives.
 */
export function extractField3Data(hexResult: string, minLength: number = 16): string | null {
  const hex = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult;
  // Detect revert: starts with 1a + "ALKANES:" ASCII
  if (hex.startsWith('1a') && hex.includes('414c4b414e45533a')) return null;

  let pos = 0;
  while (pos < hex.length - 4) {
    if (hex.slice(pos, pos + 2) === '1a') {
      const [fieldLen, afterLen] = decodeVarint(hex, pos + 2);
      if (fieldLen >= minLength && afterLen + fieldLen * 2 <= hex.length + 4) {
        return hex.slice(afterLen, afterLen + fieldLen * 2);
      }
    }
    pos += 2;
  }
  return null;
}

/** Get current block height */
async function getBlockHeight(rpcUrl: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'metashrew_height', params: [] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return parseInt(json.result, 10);
}

/**
 * Call contract via metashrew_view("simulate") protobuf.
 * Returns raw hex result.
 */
export async function simulateContract(
  rpcUrl: string,
  contractId: string,
  opcode: number,
  args: number[] = [],
): Promise<string> {
  const [block, tx] = contractId.split(':').map(Number);
  const height = await getBlockHeight(rpcUrl);

  const calldata: number[] = [];
  for (const val of [block, tx, opcode, ...args]) {
    calldata.push(...encodeLEB128(val));
  }

  const parts: number[] = [];
  // Field 4: height (varint, tag 0x20)
  parts.push(0x20);
  parts.push(...encodeLEB128(height));
  // Field 5: calldata (length-delimited, tag 0x2A)
  parts.push(0x2A);
  parts.push(...encodeLEB128(calldata.length));
  parts.push(...calldata);
  // Field 6: txindex = 1 (varint, tag 0x30)
  parts.push(0x30, 0x01);

  const hex = '0x' + Array.from(parts, b => b.toString(16).padStart(2, '0')).join('');

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'metashrew_view', params: ['simulate', hex, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
  return json.result || '';
}

/**
 * Call Espo Fujin JSON-RPC endpoint.
 */
export async function espoCall(espoUrl: string, method: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(espoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`Espo error: ${json.error.message || JSON.stringify(json.error)}`);
  return json.result;
}
