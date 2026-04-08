/**
 * alkanesExecuteTyped — typed wrapper around WASM alkanesExecuteWithStrings.
 *
 * Provides automatic address separation defaults and parses the WASM result.
 * Single source of truth — used by extendedProvider.ts (app) and integration tests.
 *
 * NOTE: This file uses relative imports only (no @/ alias) so it works in
 * both Next.js and vitest without path resolution issues.
 *
 * JOURNAL (2026-03-27): DEVNET EXECUTION PATH — alkanesExecuteFull vs alkanesExecuteWithStrings
 *
 * On devnet, this function auto-detects the in-browser environment (localhost:18888)
 * and switches from alkanesExecuteWithStrings → alkanesExecuteFull. This is critical
 * because the two SDK methods use DIFFERENT UTXO discovery paths:
 *
 *   alkanesExecuteWithStrings:
 *     - Queries UTXOs via the SDK's data API (REST endpoints like /get-alkanes-by-address)
 *     - On devnet, these route through the fetch interceptor → quspo tertiary indexer
 *     - quspo may have INCOMPLETE data (only indexes blocks after it's loaded)
 *     - Result: "Insufficient alkanes: need X, have 0" even when balance exists
 *
 *   alkanesExecuteFull:
 *     - Queries UTXOs via the PRIMARY alkanes indexer (alkanes_protorunesbyaddress RPC)
 *     - This indexer has complete data for ALL blocks since genesis
 *     - Also handles signing + broadcasting + mining internally (no manual PSBT flow)
 *     - This is the same path used by boot deploys, faucets, and the vitest suite
 *
 * The devnet path sets mine_enabled:true + auto_confirm:true so the SDK mines the
 * transaction into a block automatically. Without mine_enabled, the tx would sit in
 * the mempool with no miner to confirm it (devnet has no external miner).
 *
 * This centralized detection means ALL mutation hooks (swap, add/remove liquidity,
 * wrap, unwrap, limit orders, gauge staking, etc.) automatically use the correct
 * path on devnet without per-hook changes.
 *
 * On mainnet/regtest (non-devnet), the original alkanesExecuteWithStrings path is
 * used, returning a PSBT for the wallet to sign externally.
 *
 * JOURNAL (2026-04-02): "Insufficient alkanes" on devnet is STALE CACHE
 *
 * If limit orders (or any mutation) fail with "Insufficient alkanes: need X, have 0"
 * on devnet, this is almost always stale IndexedDB cache — NOT a code bug.
 * Fix: Use DevnetControlPanel → "Clear & Reload" to wipe cached state and reboot.
 * The sandshrew_rpc_url() detection works correctly for fresh devnet boots.
 *
 * CREATERESERVED DEPLOYMENT NOTE (2026-03-30):
 * When using alkanesExecuteFull for contract deployment (CREATERESERVED [3,slot,...args]),
 * the `args` are executed as cellpack inputs by the WASM during deployment. If the WASM
 * execution REVERTS (e.g., unrecognized opcode), the binary storage is atomically rolled
 * back — the deploy silently fails and the contract at [4:slot] has no binary.
 * Ensure init args contain a valid opcode the contract accepts. For custom contracts
 * without a no-op opcode, use opcode 0 (Initialize) with safe defaults or a stateless
 * read-only query opcode. This affects ALL proxy/beacon deployments in boot.ts.
 * Source: alkanes-rs/src/message.rs — run_special_cellpacks stores binary, but
 * handle_message() returns Err on revert → atomic.commit() never called → rollback.
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
  if (params.ordinalsStrategy !== undefined) options.ordinals_strategy = params.ordinalsStrategy;

  const toAddressesJson = JSON.stringify(toAddresses);
  const optionsJson = JSON.stringify(options);

  console.log('[alkanesExecuteTyped] to_addresses:', toAddressesJson);
  console.log('[alkanesExecuteTyped] input_requirements:', params.inputRequirements);
  console.log('[alkanesExecuteTyped] protostones:', params.protostones);
  console.log('[alkanesExecuteTyped] fee_rate:', params.feeRate);
  console.log('[alkanesExecuteTyped] options:', optionsJson);

  // On devnet, use alkanesExecuteFull which handles signing + mining internally.
  // alkanesExecuteWithStrings relies on the SDK's data API for UTXO discovery,
  // which routes through quspo on devnet. Quspo may not have indexed all blocks,
  // causing "Insufficient alkanes" errors when the wallet has enough balance.
  // alkanesExecuteFull uses the primary alkanes indexer directly.
  //
  // Detect devnet by checking if the fetch interceptor is installed (localhost:18888).
  // NOTE (2026-04-02): "Insufficient alkanes" on devnet is almost always stale IndexedDB
  // cache, NOT a detection bug. Use DevnetControlPanel "Clear & Reload" to reset state.
  const LOCAL_NETWORKS = ['devnet', 'regtest-local', 'qubitcoin-regtest'];
  let isLocalNetwork = LOCAL_NETWORKS.includes(params.network ?? '');
  if (!isLocalNetwork) {
    try {
      const rpcUrl = (provider as any).sandshrew_rpc_url?.();
      isLocalNetwork = typeof rpcUrl === 'string' && rpcUrl.includes('localhost:18888');
    } catch { /* not local */ }
  }
  if (!isLocalNetwork && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('subfrost_selected_network') ?? '';
      isLocalNetwork = LOCAL_NETWORKS.includes(stored);
    } catch { /* ignore */ }
  }

  if (isLocalNetwork && typeof (provider as any).alkanesExecuteFull === 'function') {
    // Force mine_enabled + auto_confirm for local networks so alkanesExecuteFull
    // handles signing, broadcasting, and mining in one call.
    options.mine_enabled = true;
    options.auto_confirm = true;
    const devnetOptionsJson = JSON.stringify(options);
    console.log('[alkanesExecuteTyped] Devnet: using alkanesExecuteFull (auto_confirm + mine_enabled)');
    const result = await (provider as any).alkanesExecuteFull(
      toAddressesJson,
      params.inputRequirements,
      params.protostones,
      params.feeRate ?? null,
      params.envelopeHex ?? null,
      devnetOptionsJson
    );
    return typeof result === 'string' ? JSON.parse(result) : result;
  }

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
