/**
 * FIRE Protocol simulation helpers.
 *
 * On regtest-local, alkanes_simulate (JSON-RPC wrapper) is broken in the
 * current Docker stack — but metashrew_view("simulate", protobuf) works.
 * This module uses the same direct-protobuf approach as lib/fujin/rpc.ts.
 *
 * On other networks it falls back to provider.alkanesSimulate().
 */

import { simulateContract, extractField3Data, parseU128LE } from '@/lib/fujin/rpc';
import { getRpcUrl } from '@/utils/getConfig';

const LOCAL_NETWORKS = ['regtest-local', 'devnet'];

/**
 * Simulate a contract opcode and return the field-3 data as hex.
 * Returns null on error or empty response.
 */
export async function fireSimulate(
  network: string,
  contractId: string,
  opcode: number,
  args: number[] = [],
): Promise<string | null> {
  const rpcUrl = LOCAL_NETWORKS.includes(network) ? 'http://localhost:18888' : getRpcUrl(network);
  try {
    const hex = await simulateContract(rpcUrl, contractId, opcode, args);
    return hex || null;
  } catch {
    return null;
  }
}

/**
 * Simulate and extract field-3 data, parse as u128 LE at offset 0.
 */
export async function fireSimulateU128(
  network: string,
  contractId: string,
  opcode: number,
  args: number[] = [],
): Promise<string> {
  const hex = await fireSimulate(network, contractId, opcode, args);
  if (!hex) return '0';
  const data = extractField3Data(hex, 16);
  if (!data) return '0';
  return parseU128LE(data, 0).toString();
}

/**
 * Simulate and extract field-3 data as a UTF-8 string.
 */
export async function fireSimulateString(
  network: string,
  contractId: string,
  opcode: number,
): Promise<string> {
  const hex = await fireSimulate(network, contractId, opcode);
  if (!hex) return '';
  const data = extractField3Data(hex, 1);
  if (!data) return '';
  // Decode hex pairs to ASCII
  let str = '';
  for (let i = 0; i < data.length; i += 2) {
    const byte = parseInt(data.slice(i, i + 2), 16);
    if (byte === 0) break;
    str += String.fromCharCode(byte);
  }
  return str;
}
