/**
 * alkanesExecuteTyped — typed wrapper around WASM alkanesExecuteWithStrings.
 *
 * Provides automatic address separation defaults and parses the WASM result.
 * Single source of truth — used by extendedProvider.ts (app) and integration tests.
 *
 * NOTE: This file uses relative imports only (no @/ alias) so it works in
 * both Next.js and vitest without path resolution issues.
 */

import { parseMaxVoutFromProtostones } from './helpers';
import type { AlkanesExecuteTypedParams } from './types';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Execute an alkanes contract with typed parameters and sensible defaults.
 *
 * Uses alkanesExecuteWithStrings which takes a JSON params string and returns
 * a PSBT for external wallet signing when auto_confirm is false.
 *
 * Automatic address separation:
 * - Sources UTXOs from both SegWit (p2wpkh:0) and Taproot (p2tr:0)
 * - Sends BTC change to SegWit (p2wpkh:0)
 * - Sends alkane token change to Taproot (p2tr:0)
 * - Auto-generates toAddresses from protostone vN references
 */
export async function alkanesExecuteTyped(
  provider: WebProvider,
  params: AlkanesExecuteTypedParams
): Promise<any> {
  const maxVout = parseMaxVoutFromProtostones(params.protostones);
  const toAddresses = params.toAddresses ?? Array(maxVout + 1).fill('p2tr:0');

  const options: Record<string, any> = {};

  // SDK requires BOTH 'from' and 'from_addresses' for reliable UTXO discovery
  const fromAddrs = params.fromAddresses ?? ['p2wpkh:0', 'p2tr:0'];
  options.from = fromAddrs;
  options.from_addresses = fromAddrs;
  options.change_address = params.changeAddress ?? 'p2wpkh:0';
  options.alkanes_change_address = params.alkanesChangeAddress ?? 'p2tr:0';

  // lock_alkanes prevents spending alkane UTXOs as plain BTC
  options.lock_alkanes = true;

  if (params.traceEnabled !== undefined) options.trace_enabled = params.traceEnabled;
  if (params.mineEnabled !== undefined) options.mine_enabled = params.mineEnabled;
  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;
  if (params.rawOutput !== undefined) options.raw_output = params.rawOutput;

  const toAddressesJson = JSON.stringify(toAddresses);
  const optionsJson = JSON.stringify(options);

  console.log('[alkanesExecuteTyped] to_addresses:', toAddressesJson);
  console.log('[alkanesExecuteTyped] input_requirements:', params.inputRequirements);
  console.log('[alkanesExecuteTyped] protostones:', params.protostones);
  console.log('[alkanesExecuteTyped] fee_rate:', params.feeRate);
  console.log('[alkanesExecuteTyped] options:', optionsJson);

  const result = await provider.alkanesExecuteWithStrings(
    toAddressesJson,
    params.inputRequirements,
    params.protostones,
    params.feeRate ?? null,
    params.envelopeHex ?? null,
    optionsJson
  );

  return typeof result === 'string' ? JSON.parse(result) : result;
}
