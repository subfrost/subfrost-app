/**
 * Shared utilities for alkanes RPC calls.
 *
 * All hooks that query contract state or token balances should use these
 * helpers instead of raw fetch(). This ensures consistent error handling,
 * response validation, and abort support.
 */

import { getRpcUrl } from '@/utils/getConfig';

// Factory-created alkanes (NFT receipts, LP tokens) are always at block 2
export const ALKANE_FACTORY_BLOCK = 2;

/**
 * Parse a u128 (16 bytes LE) from a hex string at a given byte offset.
 */
export function parseU128FromHex(hex: string, byteOffset: number): bigint {
  if (!hex || hex.length < (byteOffset + 16) * 2) return 0n;
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    const pos = (byteOffset + i) * 2;
    const byte = parseInt(hex.substring(pos, pos + 2), 16);
    value |= BigInt(byte) << BigInt(i * 8);
  }
  return value;
}

/**
 * Call alkanes_simulate on a target contract with given opcode inputs.
 * Returns the raw hex data string (without 0x prefix), or null on error.
 */
export async function simulateCall(
  network: string,
  targetBlock: string,
  targetTx: string,
  inputs: string[],
  signal?: AbortSignal,
): Promise<{ data: string; error: string | null }> {
  const rpcUrl = getRpcUrl(network);
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_simulate',
      params: [{
        target: { block: targetBlock, tx: targetTx },
        inputs,
        alkanes: [],
        transaction: '0x',
        block: '0x',
        height: '999',
        txindex: 0,
        vout: 0,
      }],
      id: 1,
    }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  const error = json?.result?.execution?.error || null;
  const data = (json?.result?.execution?.data || '').replace('0x', '');
  return { data, error };
}

export interface AlkaneToken {
  block: number;
  tx: number;
  amount: bigint;
}

/**
 * Query all alkane tokens at a Bitcoin address.
 * Returns an array of { block, tx, amount } tuples.
 */
export async function queryAlkanesAtAddress(
  network: string,
  address: string,
  signal?: AbortSignal,
): Promise<AlkaneToken[]> {
  const rpcUrl = getRpcUrl(network);
  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_protorunesbyaddress',
      params: [{ address, protocolTag: '1' }],
      id: 1,
    }),
  });
  if (!resp.ok) throw new Error(`RPC HTTP ${resp.status}`);
  const json = await resp.json();
  const tokens: AlkaneToken[] = [];
  for (const outpoint of json?.result?.outpoints || []) {
    const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
    for (const entry of balances) {
      tokens.push({
        block: parseInt(entry.block ?? '0', 10),
        tx: parseInt(entry.tx ?? '0', 10),
        amount: BigInt(entry.amount || '0'),
      });
    }
  }
  return tokens;
}

/**
 * Get the balance of a specific alkane token at an address.
 * Returns the total amount across all outpoints.
 */
export async function getAlkaneTokenBalance(
  network: string,
  address: string,
  alkaneId: string,
  signal?: AbortSignal,
): Promise<bigint> {
  const [targetBlock, targetTx] = alkaneId.split(':').map(Number);
  const tokens = await queryAlkanesAtAddress(network, address, signal);
  let total = 0n;
  for (const t of tokens) {
    if (t.block === targetBlock && t.tx === targetTx) {
      total += t.amount;
    }
  }
  return total;
}
