/**
 * Shared type definitions for alkanes operations.
 *
 * Single source of truth — imported by both React hooks and integration tests.
 */

import type { TxContext } from '@/context/WalletContext';

/**
 * Parameters for alkanesExecuteTyped — the primary PSBT-building interface.
 *
 * Most callers should pass `txContext` (from `useWallet()`) instead of the
 * five individual address / strategy fields. The wrapper unpacks `txContext`
 * into the underlying WASM `options_json`. Per-call overrides (`fromAddresses`,
 * `changeAddress`, `alkanesChangeAddress`, `protectTaproot`, `ordinalsStrategy`)
 * still take precedence when set — used by atomic flows and SendModal's
 * `'preserve'` ordinals override.
 */
export interface AlkanesExecuteTypedParams {
  toAddresses?: string[];
  inputRequirements: string;
  protostones: string;
  feeRate?: number;
  envelopeHex?: string;

  /**
   * Wallet-specific defaults — pass once via txContext, the individual fields
   * below override per-call site if needed. See `WalletContext.TxContext` jsdoc
   * for semantics. When `txContext` is set, `fromAddresses`, `changeAddress`,
   * `alkanesChangeAddress`, `protectTaproot`, and `ordinalsStrategy` are all
   * inherited from it unless explicitly overridden.
   */
  txContext?: TxContext;

  // Per-call overrides. When set, take precedence over the matching txContext
  // field. Leave unset to inherit from txContext.
  fromAddresses?: string[];
  changeAddress?: string;
  alkanesChangeAddress?: string;
  traceEnabled?: boolean;
  mineEnabled?: boolean;
  autoConfirm?: boolean;
  rawOutput?: boolean;
  /** Force the unsigned-PSBT path even on local networks. Used by staged
   *  package builders that need to sign/broadcast multiple txs themselves. */
  forcePsbt?: boolean;
  /** Controls handling of UTXOs that may contain ordinal inscriptions.
   *  - 'exclude': refuse to spend inscribed UTXOs (default — protects inscriptions/runes)
   *  - 'preserve': split inscribed UTXOs to protect inscriptions
   *  - 'burn': spend inscribed UTXOs without protection (destroys inscriptions)
   */
  ordinalsStrategy?: 'exclude' | 'preserve' | 'burn';
  /** Selects the SDK's UTXO data source. App default is `espo`. */
  utxoSource?: 'metashrew' | 'espo';
  /** Protect taproot UTXOs from being spent for BTC fees (default: true).
   *  When true, taproot UTXOs are only used for alkane token spending.
   *  Set to false for single-address wallets (UniSat, OKX) where taproot is the only address.
   */
  protectTaproot?: boolean;
  /** Clean BTC UTXOs for fee funding from wallet API (e.g. UniSat getBitcoinUtxos).
   *  Format: ["txid:vout:satoshis", ...]. When provided, SDK uses ONLY these for BTC fees —
   *  skips lua get_utxos entirely. Alkane UTXOs still discovered via espo.
   */
  paymentUtxos?: string[];
  /** Synthetic raw transactions that should be overlaid onto UTXO selection.
   *  Used by package flows where Tx B spends an output from a just-signed Tx A
   *  before indexers can expose it through address UTXO endpoints. */
  knownPendingTxHexes?: string[];
  /** Explicit per-outpoint TxOut and optional alkane balance assertions.
   *  This is lower-level than `cachedUtxos` and is used for synthetic package
   *  outputs whose alkane balances are known from the parent protostone. */
  prefetchedUtxos?: Array<{
    outpoint: string;
    value: number;
    script_pubkey_hex: string;
    alkanes?: Array<{ block: number; tx: number; amount: string }>;
  }>;
  /** Pre-warmed UTXO + balance-sheet snapshot from `useWalletUtxoCache`.
   *  When supplied, alkanesExecuteTyped derives `payment_utxos` (clean
   *  BTC carriers) from the cache instead of letting the WASM fan out
   *  RPC at click time. The cache is HeightPoller-invalidated and
   *  prewarmed via <WalletStatePrewarmer/>, so by the time the user
   *  clicks Swap the data is already in memory. This is what cuts
   *  click-to-popup latency from multi-second to ~0 for wallets with
   *  many dust UTXOs. */
  cachedUtxos?: Array<{
    txid: string;
    vout: number;
    value: number;
    address?: string;
    scriptPubKeyHex?: string;
    runes?: unknown[];
    alkanes?: Array<{ block: number; tx: number; amount: bigint }>;
  }>;
  /** Network name — used to reliably detect devnet (instead of URL sniffing). */
  network?: string;
  /**
   * Caller-supplied metashrew indexer height. When set, the wrapper emits
   * `options.max_indexed_height = it` so the SDK's `select_utxos` filters
   * out UTXOs from blocks the indexer hasn't processed yet — same pattern
   * subfrost-mobile uses to avoid the SDK's `waitForIndexer` stall while
   * metashrew catches up to bitcoind.
   *
   * Pass `useWalletUtxoCache().height` from any mutation hook — that value
   * IS the metashrew height the snapshot was pinned to (per the wallet-state
   * route migration). With this set, the wrapper SKIPS its own per-click
   * metashrew_height probe RPC.
   *
   * Local networks (devnet/regtest) where the user mines manually can leave
   * this unset — the wrapper preserves the historic skip-probe behavior.
   */
  maxIndexedHeight?: number;
  /** Opt-in CPFP-chained 2-tx flow for wrap+execute requests. When true and
   *  the protostones[0] is a wrap (block 32, opcode 77), alkanes-rs splits
   *  the request into Tx A (wrap-only) + Tx B (execute consuming Tx A's
   *  alkane carrier). Each tx then gets its own MINIMUM_FUEL_CHANGE1 (3.5M)
   *  budget instead of sharing the single per-tx fuel allocation, avoiding
   *  OOG when block_fuel is exhausted. Default: caller's choice — most
   *  atomic-flow hooks default to `network === 'mainnet'`. */
  splitTransactions?: boolean;
  /**
   * Pre-broadcast confirmation hook for keystore wallets. When supplied,
   * alkanesExecuteTyped:
   *
   *   1. Calls the SDK with `autoConfirm: false` so the unsigned PSBT is
   *      returned instead of being auto-signed and broadcast.
   *   2. Invokes `previewBeforeBroadcast(psbtBase64)` so the caller can
   *      build a `TxPlan` from the PSBT, show the rich confirmation
   *      modal, and resolve to `true` (approve) or `false` (reject).
   *   3. On approve: signs via `provider.walletSignPsbtBase64` and
   *      broadcasts via `provider.broadcastTransaction`. The IDB push
   *      mirror runs after broadcast as usual.
   *   4. On reject: throws "Transaction rejected by user".
   *
   * Browser wallets ignore this callback — their wallet popup is the
   * canonical confirmation, and the existing PSBT-return path through
   * the SDK (no SDK-side broadcast) is unchanged.
   *
   * For multi-tx flows (`splitTransactions: true`) the callback is
   * invoked once with the combined-PSBT bundle; callers should detect
   * and stack two TxPlan cards in the modal.
   */
  previewBeforeBroadcast?: (psbtBase64: string) => Promise<boolean>;
}
