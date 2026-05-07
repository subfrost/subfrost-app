/**
 * Public-key helpers — wallet-agnostic shape normalization.
 *
 * Browser wallets disagree on the public-key format they expose:
 *   - UniSat / OKX → 66-char hex (33-byte compressed, leading 0x02|0x03 parity)
 *   - Xverse        → 64-char hex (32-byte x-only, no parity prefix)
 *
 * Anywhere we feed a "tapInternalKey" / "x-only pubkey" into bitcoinjs-lib,
 * the SDK PSBT, or our own protostone code, we need the 32-byte x-only form.
 * Unconditional `.slice(2)` produced a 31-byte malformed key for Xverse and
 * caused PSBT input validation to reject it ("Expected Uint8Array").
 *
 * Source of truth: this helper. Consumers should NEVER hand-roll the
 * conditional — call `toXOnlyPubKeyHex` instead.
 */

export const X_ONLY_HEX_LENGTH = 64;          // 32 bytes
export const COMPRESSED_HEX_LENGTH = 66;      // 33 bytes (32 + 1 parity)

/**
 * Normalize a wallet-supplied public key hex to its x-only form.
 *
 * Returns:
 *   - empty string if `pubKeyHex` is falsy
 *   - `pubKeyHex.slice(2)` when length is 66 (strip parity prefix)
 *   - `pubKeyHex` unchanged when length is 64 (already x-only)
 *   - `pubKeyHex` unchanged for any other length — the caller is expected
 *     to validate downstream (length-check before allocating Uint8Array etc.)
 */
export function toXOnlyPubKeyHex(pubKeyHex: string | undefined | null): string {
  if (!pubKeyHex) return '';
  return pubKeyHex.length === COMPRESSED_HEX_LENGTH
    ? pubKeyHex.slice(2)
    : pubKeyHex;
}
