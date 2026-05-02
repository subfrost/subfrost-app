/**
 * Wallet settings persisted to localStorage.
 *
 * Single source of truth for advanced wallet preferences shared between
 * WalletSettings (configuration UI) and SendModal (consumer).
 */

const PROTECT_ORDINALS_AND_RUNES_KEY = 'subfrost_protect_ordinals_and_runes';
const PROTECT_ORDINALS_AND_RUNES_EVENT = 'protect-ordinals-and-runes-changed';

/**
 * Whether to protect ordinal inscriptions and runes when spending UTXOs.
 * Defaults to `true` (protect). When false, the SDK is allowed to spend
 * inscribed/rune-bearing UTXOs without splitting them off.
 */
export function getProtectOrdinalsAndRunes(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const stored = localStorage.getItem(PROTECT_ORDINALS_AND_RUNES_KEY);
  if (stored === null) return true;
  return stored !== 'false';
}

export function setProtectOrdinalsAndRunes(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(PROTECT_ORDINALS_AND_RUNES_KEY, value ? 'true' : 'false');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(PROTECT_ORDINALS_AND_RUNES_EVENT, { detail: value }),
    );
  }
}

export const PROTECT_ORDINALS_AND_RUNES_STORAGE_KEY = PROTECT_ORDINALS_AND_RUNES_KEY;
export const PROTECT_ORDINALS_AND_RUNES_CHANGE_EVENT = PROTECT_ORDINALS_AND_RUNES_EVENT;
