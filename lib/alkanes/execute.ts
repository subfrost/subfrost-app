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

import * as bitcoin from 'bitcoinjs-lib';
import { parseMaxVoutFromProtostones, extractPsbtBase64, getBitcoinNetwork } from './helpers';
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

  // Per-call overrides win over txContext defaults. If neither is set we fall
  // back to symbolic SDK defaults (only safe for the dummy-wallet boot path —
  // every browser/keystore caller passes txContext or explicit addresses).
  const fromAddrs =
    params.fromAddresses ?? params.txContext?.feeSourceAddresses ?? ['p2wpkh:0', 'p2tr:0'];
  options.from = fromAddrs;
  options.from_addresses = fromAddrs;
  options.change_address =
    params.changeAddress ?? params.txContext?.btcChangeAddress ?? 'p2wpkh:0';
  options.alkanes_change_address =
    params.alkanesChangeAddress ?? params.txContext?.alkanesChangeAddress ?? 'p2tr:0';

  if (params.traceEnabled !== undefined) options.trace_enabled = params.traceEnabled;
  if (params.mineEnabled !== undefined) options.mine_enabled = params.mineEnabled;
  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;
  if (params.rawOutput !== undefined) options.raw_output = params.rawOutput;
  // Forward to alkanes-rs `execute_full`'s split-tx gate (parsed at
  // alkanes-web-sys/src/provider.rs line ~826). Without this line the
  // mutation hooks' `splitTransactions: ... === true` becomes a silent
  // no-op — the WASM provider never sees the field, defaults to false,
  // and the gate at execute.rs line 211 is skipped. That bug surfaced
  // during the 2026-05-03 mainnet camoufoxd run as "only 1
  // sendrawtransaction observed when wrap+swap should produce 2."
  if (params.splitTransactions !== undefined) options.split_transactions = params.splitTransactions;

  const ordinalsStrategy = params.ordinalsStrategy ?? params.txContext?.defaultOrdinalsStrategy;
  if (ordinalsStrategy !== undefined) options.ordinals_strategy = ordinalsStrategy;

  const protectTaproot = params.protectTaproot ?? params.txContext?.shouldProtectTaproot;
  if (protectTaproot !== undefined) options.protect_taproot = protectTaproot;

  if (params.paymentUtxos?.length) {
    options.payment_utxos = params.paymentUtxos;
  } else if (params.txContext?.walletType === 'browser') {
    // Browser auto-default: pull wallet-side clean BTC UTXOs (UniSat today)
    // so SDK's coinselect skips inscription/rune-bearing UTXOs for fee
    // inputs. Wallets without the capability (`getCleanBtcUtxos` adapter
    // returns null) fall through to SDK's own UTXO discovery — still safe,
    // just slower and dependent on the SDK ord-check for protection.
    try {
      const { getCleanBtcUtxosForWallet } = await import('@/lib/wallet/walletCapabilities');
      const clean = await getCleanBtcUtxosForWallet(params.txContext.browserWalletId);
      if (clean?.length) options.payment_utxos = clean;
    } catch (e) {
      console.warn('[alkanesExecuteTyped] getCleanBtcUtxosForWallet failed:', e);
    }
  }
  // Cache-fast path for any wallet type. The mutation hook can pass the
  // pre-warmed UTXO snapshot through `params.cachedUtxos`; we filter to
  // clean BTC carriers (non-dust, no alkane balance sheet) and hand them
  // to the SDK as `payment_utxos`. This skips the WASM's internal
  // `select_utxos` BTC fanout — for wallets with many UTXOs that fanout
  // is the user-visible "click → wallet popup" delay.
  if (!options.payment_utxos && params.cachedUtxos?.length) {
    const clean = params.cachedUtxos
      .filter((u) => (u.alkanes?.length ?? 0) === 0 && u.value > 1000)
      .map((u) => ({ txid: u.txid, vout: u.vout, value: u.value }));
    if (clean.length > 0) {
      options.payment_utxos = clean;
      console.log(
        `[alkanesExecuteTyped] payment_utxos: ${clean.length} clean BTC UTXOs from prefetched cache (skipping WASM fanout)`,
      );
    }
  }

  // PERF: prefetched_utxos — caller-supplied (outpoint, value, scriptPubKey)
  // map that the SDK consumes inside `validate_transaction` and
  // `build_psbt_and_fee` to skip per-UTXO `getrawtransaction` roundtrips.
  // Required by the alkanes-rs change in https://github.com/kungfuflex/alkanes-rs/pull/256
  // (SDK ≥0.1.5-<that-commit>); ignored by older SDKs since the field is
  // `#[serde(default)]` Rust-side. Kills the largest contributor to swap
  // click→signing latency (~7-10s of the 16-17s observed for 32-UTXO wallets).
  //
  // Every cached UTXO contributes — not just clean BTC carriers. The SDK's
  // hot loops iterate the FULL selected set (including alkane-bearing dust
  // and inscribed UTXOs), so anything we cache here saves a roundtrip.
  if (params.cachedUtxos?.length) {
    try {
      const btcNetwork = getBitcoinNetwork(params.network ?? 'mainnet');
      const prefetched = params.cachedUtxos.map((u) => {
        // Derive scriptPubKey from address — pure compute, no RPC.
        // Falls through to the slow path on per-UTXO derivation failure
        // (defensive: never let a bad address abort the whole execute).
        if (!u.address) return null;
        let scriptPubKeyHex: string;
        try {
          const script = bitcoin.address.toOutputScript(u.address, btcNetwork);
          scriptPubKeyHex = Buffer.from(script).toString('hex');
        } catch {
          return null;
        }
        return {
          outpoint: `${u.txid}:${u.vout}`,
          value: u.value,
          script_pubkey_hex: scriptPubKeyHex,
        };
      }).filter((x): x is { outpoint: string; value: number; script_pubkey_hex: string } => x !== null);
      if (prefetched.length > 0) {
        options.prefetched_utxos = prefetched;
        console.log(
          `[alkanesExecuteTyped] prefetched_utxos: ${prefetched.length} TxOuts from wallet cache (skips ~${prefetched.length * 2} getrawtransaction roundtrips)`,
        );
      }
    } catch (e) {
      console.warn('[alkanesExecuteTyped] failed to build prefetched_utxos:', e);
    }
  }

  const toAddressesJson = JSON.stringify(toAddresses);
  const optionsJson = JSON.stringify(options);

  console.log('[alkanesExecuteTyped] to_addresses:', toAddressesJson);
  console.log('[alkanesExecuteTyped] input_requirements:', params.inputRequirements);
  console.log('[alkanesExecuteTyped] protostones:', params.protostones);
  console.log('[alkanesExecuteTyped] fee_rate:', params.feeRate);
  console.log('[alkanesExecuteTyped] options:', optionsJson);

  // Proactive indexer-sync probe (2026-05-04, fixes "Indexer sync timed out").
  //
  // alkanesExecuteWithStrings / alkanesExecuteFull internally call
  // `webprovider_waitForIndexer` before broadcast and time out at 30s if
  // metashrew_height < bitcoind_blockcount. On mainnet the gateway is
  // sometimes one block apart for ~10–30s; the timeout buries the swap on
  // "Building Transaction" forever. The elegant pattern (97b1aec2 — "fix:
  // update @alkanes/ts-sdk with indexer sync fix") is to probe the
  // SDK's sync primitive ourselves first so a transient gap becomes a
  // short pre-flight wait instead of a deep failure. Catching here in the
  // central wrapper covers swap / wrap / unwrap / send / addLiquidity in
  // one place — no per-hook duplication.
  try {
    if (typeof (provider as any).waitForIndexer === 'function') {
      await (provider as any).waitForIndexer();
    }
  } catch (syncErr) {
    console.warn('[alkanesExecuteTyped] proactive waitForIndexer failed, continuing:', syncErr);
  }

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

  // Use alkanesExecuteFull when:
  // 1. Local networks (devnet/regtest) — needs mine_enabled for block confirmation
  // 2. Keystore wallets (auto_confirm=true) on any network — mnemonic loaded in provider,
  //    SDK signs + broadcasts internally. alkanesExecuteWithStrings only returns a PSBT
  //    without signing, which is useless for keystore wallets.
  //
  // EXCEPTION (2026-05-05): when `previewBeforeBroadcast` is supplied,
  // we always use alkanesExecuteWithStrings (returns PSBT) for keystore
  // too. The caller previews the unsigned PSBT (rich confirmation
  // modal), then we sign + broadcast manually via walletSignPsbtBase64
  // + broadcastTransaction. Devnet/regtest still uses the auto-mine
  // path because the user controls block production there.
  const wantPreview = !!params.previewBeforeBroadcast && !isLocalNetwork;
  const useFullExecution =
    !wantPreview &&
    (isLocalNetwork || params.autoConfirm) &&
    typeof (provider as any).alkanesExecuteFull === 'function';

  if (useFullExecution) {
    if (isLocalNetwork) {
      options.mine_enabled = true;
    }
    options.auto_confirm = true;
    const fullOptionsJson = JSON.stringify(options);
    console.log(`[alkanesExecuteTyped] Using alkanesExecuteFull (auto_confirm=true, mine_enabled=${!!options.mine_enabled})`);
    const minFeeRate = params.network === 'qubitcoin-regtest' ? 5 : (params.feeRate ?? null);
    const feeRate = params.feeRate && params.feeRate >= (minFeeRate || 0) ? params.feeRate : minFeeRate;
    const result = await (provider as any).alkanesExecuteFull(
      toAddressesJson,
      params.inputRequirements,
      params.protostones,
      feeRate,
      params.envelopeHex ?? null,
      fullOptionsJson
    );
    return typeof result === 'string' ? JSON.parse(result) : result;
  }

  // PSBT-return path (browser wallets always; keystore when previewing).
  const result = await provider.alkanesExecuteWithStrings(
    toAddressesJson,
    params.inputRequirements,
    params.protostones,
    params.feeRate ?? null,
    params.envelopeHex ?? null,
    optionsJson
  );
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;

  // Keystore preview path: extract PSBT, hand to caller for confirmation,
  // sign + broadcast on approve.
  if (wantPreview && params.previewBeforeBroadcast && params.txContext?.walletType === 'keystore') {
    const psbtBase64 = extractPsbtBase64FromExecuteResult(parsed);
    if (!psbtBase64) {
      // Hard-fail rather than silently `return parsed` — the caller
      // expects either a real txid (on approve) or a thrown error
      // ("Transaction rejected by user" on reject). Returning a
      // PSBT-less parsed object misleads `useAlkaneSendMutation` into
      // reporting `success: true, txid: null` and the UI shows
      // "broadcast" with an empty explorer link. Bug repro:
      // __tests__/repro/diesel-send-30000.test.ts (2026-05-05).
      console.error(
        '[alkanesExecuteTyped] previewBeforeBroadcast supplied but no PSBT in SDK result',
        { topLevelKeys: Object.keys(parsed ?? {}) },
      );
      throw new Error('SDK did not return a signable PSBT');
    }
    const approved = await params.previewBeforeBroadcast(psbtBase64);
    if (!approved) {
      throw new Error('Transaction rejected by user');
    }
    if (typeof (provider as any).walletSignPsbtBase64 !== 'function') {
      throw new Error('Provider missing walletSignPsbtBase64 — bump @alkanes/ts-sdk');
    }
    const signedHex: string = await (provider as any).walletSignPsbtBase64(psbtBase64);
    const txid: string = await (provider as any).broadcastTransaction(signedHex);
    return { ...parsed, txid, tx_hex: signedHex, signed_hex: signedHex };
  }

  return parsed;
}

/**
 * Best-effort PSBT base64 extraction from the polymorphic SDK result.
 *
 * The SDK has shipped a few different shapes over time:
 *   - Plain base64 string
 *   - Uint8Array (raw bytes — toBase64 needed)
 *   - Numeric-key object `{"0":112,"1":115,...}` (serialized Uint8Array
 *     after the WASM bridge crosses a JSON boundary). This is the
 *     dominant shape returned by alkanesExecuteWithStrings on mainnet
 *     today (verified 2026-05-05 via __tests__/repro/diesel-send-30000).
 *     If we don't decode it, we silently fall through to "no PSBT"
 *     and the caller mistakenly reports broadcast success with no txid.
 *
 * `extractPsbtBase64` (from `helpers.ts`) handles all three shapes; we
 * defer to it but swallow throws so the central preview path can still
 * gracefully fall back when a candidate is malformed.
 */
function extractPsbtBase64FromExecuteResult(result: any): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const candidates = [
    result?.readyToSign?.psbt,
    result?.ready_to_sign?.psbt,
    result?.psbt,
    result?.psbtBase64,
    result?.psbt_base64,
    result?.unsigned_psbt,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === 'string' && c.length > 0) return c;
    if (c instanceof Uint8Array && c.length > 0) {
      try { return extractPsbtBase64(c); } catch { continue; }
    }
    if (typeof c === 'object') {
      // Numeric-keyed Uint8Array → base64 via the shared helper.
      try { return extractPsbtBase64(c); } catch { continue; }
    }
  }
  return undefined;
}
