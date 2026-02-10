/**
 * Extended Alkanes Provider
 *
 * Wraps the WASM WebProvider and adds the `alkanesExecuteTyped` method
 * with sensible defaults for address separation:
 * - fromAddresses: ['p2wpkh:0', 'p2tr:0'] (sources from both SegWit and Taproot)
 * - changeAddress: 'p2wpkh:0' (BTC change -> SegWit)
 * - alkanesChangeAddress: 'p2tr:0' (alkane change -> Taproot)
 *
 * LOCAL TESTING SUPPORT:
 * Includes RPC logging via @/lib/rpcLogger for debugging WASM SDK calls.
 * This is particularly useful when testing against regtest-local (local Docker).
 * Enable verbose logging in browser console: rpcDebug.enable()
 */

import { logWasmCall, logWasmResult, logWasmError } from '@/lib/rpcLogger';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

export interface AlkanesExecuteTypedParams {
  toAddresses?: string[];
  inputRequirements: string;
  protostones: string;
  feeRate?: number;
  envelopeHex?: string;
  fromAddresses?: string[];
  changeAddress?: string;
  alkanesChangeAddress?: string;
  traceEnabled?: boolean;
  mineEnabled?: boolean;
  autoConfirm?: boolean;
  rawOutput?: boolean;
}

/**
 * Parse protostones string to find the maximum vN output index referenced
 * This is used to auto-generate the correct number of to_addresses
 *
 * @param protostones - Protostone specification string
 * @returns Maximum vout index found (e.g., "v2" returns 2)
 */
function parseMaxVoutFromProtostones(protostones: string): number {
  let maxVout = 0;

  // Match all vN patterns in the protostones string
  const voutMatches = protostones.matchAll(/v(\d+)/g);

  for (const match of voutMatches) {
    const voutIndex = parseInt(match[1], 10);
    if (voutIndex > maxVout) {
      maxVout = voutIndex;
    }
  }

  return maxVout;
}

/**
 * Execute an alkanes contract with typed parameters and sensible defaults.
 *
 * Uses alkanesExecute which takes a JSON params string and returns a PSBT
 * for external wallet signing when auto_confirm is false.
 *
 * This provides automatic address separation:
 * - Sources UTXOs from both SegWit (p2wpkh:0) and Taproot (p2tr:0)
 * - Sends BTC change to SegWit (p2wpkh:0)
 * - Sends alkane token change to Taproot (p2tr:0)
 * - Auto-generates toAddresses from protostone vN references
 *
 * @param provider - The WASM WebProvider instance
 * @param params - Typed execution parameters
 * @returns Execution result (PSBT when auto_confirm is false)
 */
export async function alkanesExecuteTyped(
  provider: WebProvider,
  params: AlkanesExecuteTypedParams
): Promise<any> {
  // Parse protostones to determine how many vN outputs are referenced
  const maxVout = parseMaxVoutFromProtostones(params.protostones);

  // Auto-generate toAddresses if not provided
  // Creates one p2tr:0 output for each vN reference (v0, v1, v2, etc.)
  const toAddresses = params.toAddresses ?? Array(maxVout + 1).fill('p2tr:0');

  // Build options object
  const options: Record<string, any> = {};

  // Apply automatic defaults for address separation
  // NOTE: SDK requires BOTH 'from' and 'from_addresses' for reliable UTXO discovery
  // This matches the working implementation in useWrapMutation
  const fromAddrs = params.fromAddresses ?? ['p2wpkh:0', 'p2tr:0'];
  options.from = fromAddrs;
  options.from_addresses = fromAddrs;
  options.change_address = params.changeAddress ?? 'p2wpkh:0';
  options.alkanes_change_address = params.alkanesChangeAddress ?? 'p2tr:0';

  // lock_alkanes prevents the SDK from accidentally spending alkane UTXOs as plain BTC
  // This is critical for operations that require specific alkane inputs
  options.lock_alkanes = true;

  if (params.traceEnabled !== undefined) options.trace_enabled = params.traceEnabled;
  if (params.mineEnabled !== undefined) options.mine_enabled = params.mineEnabled;
  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;
  if (params.rawOutput !== undefined) options.raw_output = params.rawOutput;

  // Build parameters for alkanesExecuteWithStrings
  // This returns a PSBT for signing - caller handles sign + broadcast
  const toAddressesJson = JSON.stringify(toAddresses);
  const optionsJson = JSON.stringify(options);

  console.log('[alkanesExecuteTyped] Calling alkanesExecuteWithStrings with:');
  console.log('[alkanesExecuteTyped]   to_addresses:', toAddressesJson);
  console.log('[alkanesExecuteTyped]   input_requirements:', params.inputRequirements);
  console.log('[alkanesExecuteTyped]   protostones:', params.protostones);
  console.log('[alkanesExecuteTyped]   protostones type:', typeof params.protostones);
  console.log('[alkanesExecuteTyped]   protostones length:', params.protostones?.length);
  console.log('[alkanesExecuteTyped]   fee_rate:', params.feeRate);
  console.log('[alkanesExecuteTyped]   options:', optionsJson);

  // Validate protostone format
  const protostoneStr = params.protostones;
  if (protostoneStr && protostoneStr.includes('[') && protostoneStr.includes(']')) {
    const cellpackMatch = protostoneStr.match(/\[([^\]]+)\]/);
    if (cellpackMatch) {
      console.log('[alkanesExecuteTyped]   Detected cellpack in protostone:', cellpackMatch[1]);
    } else {
      console.warn('[alkanesExecuteTyped]   WARNING: No cellpack found in protostone!');
    }
  }

  // Use alkanesExecuteWithStrings which returns a PSBT for external signing
  // The caller (useWrapMutation, useSwapMutation) handles signing and broadcasting
  const startTime = Date.now();
  logWasmCall('alkanesExecuteWithStrings', [
    toAddressesJson,
    params.inputRequirements,
    params.protostones,
    params.feeRate ?? null,
    params.envelopeHex ?? null,
    optionsJson,
  ]);

  // Timeout guard: the WASM SDK may hang indefinitely if UTXO discovery fails
  // (e.g., esplora unreachable, symbolic address resolves to wrong wallet).
  // 60s is generous — normal calls complete in <10s on mainnet.
  const EXECUTE_TIMEOUT_MS = 60_000;

  try {
    const executePromise = provider.alkanesExecuteWithStrings(
      toAddressesJson,
      params.inputRequirements,
      params.protostones,
      params.feeRate ?? null,
      params.envelopeHex ?? null,
      optionsJson
    );

    const result = await Promise.race([
      executePromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          `alkanesExecuteWithStrings timed out after ${EXECUTE_TIMEOUT_MS / 1000}s. ` +
          'This may indicate UTXO discovery is stuck — check browser console for network errors.'
        )), EXECUTE_TIMEOUT_MS)
      ),
    ]);

    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    logWasmResult('alkanesExecuteWithStrings', parsed, Date.now() - startTime);
    return parsed;
  } catch (error) {
    logWasmError('alkanesExecuteWithStrings', error, [
      toAddressesJson,
      params.inputRequirements,
      params.protostones,
      params.feeRate,
      optionsJson,
    ]);
    throw error;
  }
}

/**
 * Extended provider type that includes alkanesExecuteTyped
 */
export interface ExtendedWebProvider extends WebProvider {
  alkanesExecuteTyped: (params: AlkanesExecuteTypedParams) => Promise<any>;
}

/**
 * Extend a WebProvider with the alkanesExecuteTyped method
 *
 * @param provider - The WASM WebProvider instance
 * @returns Extended provider with alkanesExecuteTyped method
 */
export function extendProvider(provider: WebProvider): ExtendedWebProvider {
  const extended = provider as ExtendedWebProvider;
  extended.alkanesExecuteTyped = (params: AlkanesExecuteTypedParams) =>
    alkanesExecuteTyped(provider, params);
  return extended;
}
