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
  /** Controls handling of UTXOs that may contain ordinal inscriptions.
   *  - 'exclude': refuse to spend inscribed UTXOs (default — protects inscriptions/runes)
   *  - 'preserve': split inscribed UTXOs to protect inscriptions
   *  - 'burn': spend inscribed UTXOs without protection (destroys inscriptions)
   */
  ordinalsStrategy?: 'exclude' | 'preserve' | 'burn';
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
  /** Network name — used to reliably detect devnet (instead of URL sniffing). */
  network?: string;
  /** Opt-in CPFP-chained 2-tx flow for wrap+execute requests. When true and
   *  the protostones[0] is a wrap (block 32, opcode 77), alkanes-rs splits
   *  the request into Tx A (wrap-only) + Tx B (execute consuming Tx A's
   *  alkane carrier). Each tx then gets its own MINIMUM_FUEL_CHANGE1 (3.5M)
   *  budget instead of sharing the single per-tx fuel allocation, avoiding
   *  OOG when block_fuel is exhausted. Default: caller's choice — most
   *  atomic-flow hooks default to `network === 'mainnet'`. */
  splitTransactions?: boolean;
}
