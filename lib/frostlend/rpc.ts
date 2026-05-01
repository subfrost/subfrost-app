/**
 * Frostlend RPC helpers — used by read-only hooks (useTroveData, useSystemData, etc.)
 *
 * All reads go through `alkanes_simulate` against the network-specific RPC URL.
 * On devnet, getRpcUrl('devnet') returns localhost:18888 which the DevnetProvider
 * fetch interceptor routes to the in-process indexer.
 *
 * Output parsing: contracts return u128 values as 16 bytes little-endian. Helpers
 * here parse hex (with or without 0x prefix) into BigInt without using Buffer
 * (Buffer is Node-only; this code runs in the browser).
 */

import { getRpcUrl } from '@/utils/getConfig';

export type SimulateResult = { data?: string | number[]; error?: string } | null;

/**
 * Run alkanes_simulate against {network}. Returns result.execution or null on failure.
 * NOTE: opcode args must be string-typed in the inputs array (alkanes RPC convention).
 */
export async function simulateAlkane(
  network: string,
  target: { block: string; tx: string },
  inputs: string[],
): Promise<SimulateResult> {
  try {
    const resp = await fetch(getRpcUrl(network), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alkanes_simulate',
        params: [{
          target,
          inputs,
          alkanes: [],
          transaction: '0x',
          block: '0x',
          height: '999999',
          txindex: 0,
          vout: 0,
        }],
        id: 1,
      }),
    });
    const data = await resp.json();
    return data?.result?.execution || null;
  } catch {
    return null;
  }
}

/** Parse "block:tx" → simulate target. */
export function parseAlkaneTarget(id: string): { block: string; tx: string } {
  const [block, tx] = id.split(':');
  return { block, tx };
}

/**
 * Convert response `data` (hex string OR byte array) to a normalized byte array.
 * Browser-safe — no Buffer, no Node-only APIs.
 */
function toBytes(data: string | number[]): number[] {
  if (Array.isArray(data)) return data;
  const clean = (data || '').replace(/^0x/, '');
  const bytes: number[] = new Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16) || 0;
  }
  return bytes;
}

/**
 * Read 16 bytes LE from a simulate response and return BigInt.
 * Returns 0n for empty / missing / too-short data.
 */
export function parseU128(execution: SimulateResult): bigint {
  if (!execution || execution.error || !execution.data) return 0n;
  const bytes = toBytes(execution.data).slice(0, 16);
  if (bytes.length === 0) return 0n;
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    v = (v << 8n) | BigInt(bytes[i]);
  }
  return v;
}

/** Read first byte from response — for u8 returns (status, recovery-mode flag, etc.). */
export function parseU8(execution: SimulateResult): number {
  if (!execution || execution.error || !execution.data) return 0;
  const bytes = toBytes(execution.data);
  return bytes[0] ?? 0;
}

/** Read u32 LE (4 bytes) from response — for last-update timestamps, etc. */
export function parseU32(execution: SimulateResult): number {
  if (!execution || execution.error || !execution.data) return 0;
  const bytes = toBytes(execution.data).slice(0, 4);
  return (bytes[0] || 0) | ((bytes[1] || 0) << 8) | ((bytes[2] || 0) << 16) | ((bytes[3] || 0) << 24);
}
