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
}
