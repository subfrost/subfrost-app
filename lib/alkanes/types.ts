/**
 * Shared type definitions for alkanes operations.
 *
 * Single source of truth — imported by both React hooks and integration tests.
 */

/**
 * Parameters for alkanesExecuteTyped — the primary PSBT-building interface.
 */
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
  /** Network name — used to reliably detect devnet (instead of URL sniffing). */
  network?: string;
}
