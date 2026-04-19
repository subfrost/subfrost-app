/**
 * Shared utilities for alkanes RPC calls.
 *
 * All hooks that query contract state or token balances should use these
 * helpers. Internally delegates to `lib/alkanes/rpc.ts` — the single
 * fetch-layer source of truth. This file is kept as a thin compatibility
 * shim so its 4 call sites don't need to change during the migration.
 *
 * Phase 3 of the ts-sdk minimization plan (2026-04-18): consolidated
 * duplicate `alkanes_protorunesbyaddress` + `alkanes_simulate` implementations.
 */

import { alkanesSimulate, getProtorunesByAddress } from '@/lib/alkanes/rpc';

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
  const result = await alkanesSimulate(
    network,
    {
      target: `${targetBlock}:${targetTx}`,
      inputs,
      height: '999',
    },
    signal,
  );
  return {
    data: (result.execution?.data || '').replace('0x', ''),
    error: result.execution?.error ?? null,
  };
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
  const response = await getProtorunesByAddress(network, address, signal);
  const tokens: AlkaneToken[] = [];
  for (const outpoint of response?.outpoints || []) {
    const balances =
      outpoint.balance_sheet?.cached?.balances ||
      (outpoint as unknown as { runes?: { block: number; tx: number; amount: string }[] }).runes ||
      [];
    for (const entry of balances) {
      tokens.push({
        block: parseInt(String(entry.block ?? '0'), 10),
        tx: parseInt(String(entry.tx ?? '0'), 10),
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
