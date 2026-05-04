/**
 * Extended Alkanes Provider
 *
 * Wraps the WASM WebProvider and adds the `alkanesExecuteTyped` method.
 * This file is the app-side entry point that adds RPC logging.
 * The core logic lives in ./execute.ts (shared with integration tests).
 *
 * LOCAL TESTING SUPPORT:
 * Includes RPC logging via @/lib/rpcLogger for debugging WASM SDK calls.
 * Enable verbose logging in browser console: rpcDebug.enable()
 *
 * SDK UPDATE (2026-02-20):
 * Updated @alkanes/ts-sdk from develop branch. The SDK now includes:
 * - WasmBrowserWalletProvider: New class for wrapping browser wallets
 * - JsWalletAdapter interface: For creating custom wallet adapters
 * - alkanesExecuteFull: Handles complete execution flow internally
 * Current implementation continues to use alkanesExecuteWithStrings (still available).
 */

import { logWasmCall, logWasmResult, logWasmError } from '@/lib/rpcLogger';
import { alkanesExecuteTyped as executeTypedCore } from './execute';
import { parseMaxVoutFromProtostones } from './helpers';
import type { AlkanesExecuteTypedParams } from './types';

// Re-export types for backwards compatibility
export type { AlkanesExecuteTypedParams } from './types';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

/**
 * Execute an alkanes contract with typed parameters, sensible defaults,
 * and RPC logging for the browser environment.
 *
 * This wraps the core execute function with app-specific RPC logging.
 * For test environments that don't need logging, import from ./execute.ts directly.
 */
export async function alkanesExecuteTyped(
  provider: WebProvider,
  params: AlkanesExecuteTypedParams
): Promise<any> {
  const maxVout = parseMaxVoutFromProtostones(params.protostones);
  const toAddresses = params.toAddresses ?? Array(maxVout + 1).fill('p2tr:0');

  // Mirror execute.ts' override-then-txContext-then-default chain so logs
  // reflect the actual values that will reach the WASM provider.
  const fromAddrs =
    params.fromAddresses ?? params.txContext?.feeSourceAddresses ?? ['p2wpkh:0', 'p2tr:0'];
  const options: Record<string, any> = {
    from: fromAddrs,
    from_addresses: fromAddrs,
    change_address:
      params.changeAddress ?? params.txContext?.btcChangeAddress ?? 'p2wpkh:0',
    alkanes_change_address:
      params.alkanesChangeAddress ?? params.txContext?.alkanesChangeAddress ?? 'p2tr:0',
    lock_alkanes: true,
  };

  if (params.traceEnabled !== undefined) options.trace_enabled = params.traceEnabled;
  if (params.mineEnabled !== undefined) options.mine_enabled = params.mineEnabled;
  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;
  if (params.rawOutput !== undefined) options.raw_output = params.rawOutput;
  const ordinalsStrategy = params.ordinalsStrategy ?? params.txContext?.defaultOrdinalsStrategy;
  if (ordinalsStrategy !== undefined) options.ordinals_strategy = ordinalsStrategy;

  const toAddressesJson = JSON.stringify(toAddresses);
  const optionsJson = JSON.stringify(options);

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

  const methodLabel = `alkanesExecuteTyped[network=${params.network ?? 'unknown'}]`;
  const startTime = Date.now();
  logWasmCall(methodLabel, [
    toAddressesJson,
    params.inputRequirements,
    params.protostones,
    params.feeRate ?? null,
    optionsJson,
  ]);

  try {
    const parsed = await executeTypedCore(provider, params);
    logWasmResult(methodLabel, parsed, Date.now() - startTime);

    // Mirror to the browser-side IndexedDB pending-tx store so the
    // optimistic balance overlay survives page reloads. The SDK
    // auto-pushes to its in-memory WASM store on broadcast, but that
    // state is lost when the WebProvider is recreated. The IDB layer
    // is the durable cross-session record. Any tx hex returned by
    // executeTypedCore — wrap, swap, addLiquidity, alkane-send — is a
    // candidate for the overlay.
    if (typeof window !== 'undefined' && parsed) {
      const candidates = [
        parsed?.tx_hex,
        parsed?.transaction_hex,
        parsed?.txHex,
        parsed?.hex,
        parsed?.broadcast?.tx_hex,
        parsed?.broadcast_tx?.tx_hex,
        parsed?.tx?.hex,
        parsed?.raw_tx,
        parsed?.raw,
        parsed?.transaction?.hex,
      ];
      for (const c of candidates) {
        if (typeof c === 'string' && /^[0-9a-fA-F]{40,}$/.test(c.replace(/^0x/, ''))) {
          try {
            const { pendingTxStore } = await import('./pendingTxStore');
            await pendingTxStore.add(c);
          } catch (e) {
            console.warn('[alkanesExecuteTyped] pendingTxStore.add failed:', e);
          }
          break;
        }
      }
    }

    return parsed;
  } catch (error) {
    logWasmError(methodLabel, error, [
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
 * Extend a WebProvider with the alkanesExecuteTyped method.
 * When network is provided, it's injected into every call so execute.ts
 * can reliably detect devnet without each hook passing it explicitly.
 */
export function extendProvider(provider: WebProvider, network?: string): ExtendedWebProvider {
  const extended = provider as ExtendedWebProvider;
  extended.alkanesExecuteTyped = (params: AlkanesExecuteTypedParams) =>
    alkanesExecuteTyped(provider, { ...params, network: params.network ?? network });
  return extended;
}
