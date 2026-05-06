/**
 * FROST-protocol address guard.
 *
 * Wrap / unwrap / bridge mutations send the user's address off-chain to
 * FROST signers, which derive shared keys from it to sign tokens back
 * to the user. The current FROST setup expects the user to hold a P2TR
 * (taproot) address — non-taproot recipients aren't supported by the
 * signer protocol as deployed.
 *
 * Non-taproot wallet users (UniSat in Native SegWit / Nested SegWit /
 * Legacy mode, OKX in Native SegWit / Nested SegWit) can still swap,
 * provide liquidity, deposit/withdraw vaults, and send alkanes / BTC —
 * but FROST flows must error with a clear, actionable message.
 *
 * Usage at the top of any FROST mutation hook:
 *
 *     const taprootAddress = requireTaprootForFrost(
 *       account?.taproot?.address,
 *       'wrap BTC',
 *     );
 */

const FROST_HINT =
  'This operation requires a Taproot (P2TR) address. ' +
  'Open your wallet (UniSat: Settings → Address Type → Taproot; ' +
  'OKX: Switch Address Type → Taproot), then reconnect.';

export class FrostRequiresTaprootError extends Error {
  constructor(public operation: string) {
    super(`Cannot ${operation} from this wallet — Taproot address required. ${FROST_HINT}`);
    this.name = 'FrostRequiresTaprootError';
  }
}

/**
 * Throws `FrostRequiresTaprootError` if `taprootAddress` is missing or
 * empty. Returns the address narrowed to `string` on success.
 */
export function requireTaprootForFrost(
  taprootAddress: string | undefined | null,
  operation: string,
): string {
  if (!taprootAddress) {
    throw new FrostRequiresTaprootError(operation);
  }
  return taprootAddress;
}
