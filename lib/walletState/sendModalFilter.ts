/**
 * Pure UTXO filter shared between the Send Bitcoin modal and the
 * headless display-verification harness (`scripts/verify-display-mainnet.ts`).
 *
 * 2026-05-18: this exists because the inline filter inside
 * `app/wallet/components/SendModal.tsx` was reproducing the SAME bug
 * class (metashrew-vs-bitcoind confirmation gating, dust handling,
 * frozen-utxo skip) that we'd already fixed in `fetchWalletState` —
 * but because the filter lived inside a React component it had no
 * vitest coverage and no way to be exercised against live mainnet
 * without a browser. Mork1e kept catching surface-level regressions
 * (IMG_2439, "Available: 0.00019581 BTC", "Available: 0.00137969 BTC")
 * after we shipped fixes that DID pass the unit tests but only
 * touched one consumer.
 *
 * Extracting the filter into this module:
 *   - The component imports + delegates to `selectAvailableUtxos`, so
 *     the displayed "Available BTC" line is computed from the same
 *     function the harness exercises against live mainnet.
 *   - Future fixes update this one function; the harness re-runs and
 *     proves the SendModal display stayed consistent before merge.
 *   - New invariants ("alkane carriers must never appear as BTC
 *     spendable", "blockHeight !== null implies confirmed", etc.) get
 *     pinned in `__tests__/sendModalFilter.test.ts` and asserted by
 *     the harness for any real wallet.
 *
 * Behavior is INTENTIONALLY identical to the historical inline filter
 * so this is a refactor, not a behavior change. The next push fixes
 * the actual 137_969-vs-230_736 bug in mork's screenshot.
 */

export interface SendModalFilterUtxo {
  txid: string;
  vout: number;
  value: number;
  address: string;
  status: { confirmed: boolean; block_height?: number };
  alkanes?: Record<string, unknown> | unknown[];
  runes?: Record<string, unknown> | unknown[];
  inscriptions?: unknown[];
}

export interface SendModalFilterOptions {
  /** All UTXOs known to the wallet snapshot. */
  utxos: SendModalFilterUtxo[];
  /**
   * Txids of pending mempool transactions WE broadcast in-session.
   * Outputs of these are allowed through the confirmed-only gate so
   * back-to-back sends don't block on indexer lag.
   */
  ourPendingTxids: Set<string>;
  /**
   * Set of `txid:vout` strings the user has frozen (excluded by hand).
   * Frozen UTXOs are skipped unless `showFrozenUtxos` is true.
   */
  frozenUtxos: Set<string>;
  /** Show frozen UTXOs (toggle in the UI). */
  showFrozenUtxos: boolean;
  /**
   * Addresses we consider fee-source for BTC sends. On dual-address
   * wallets this is just the segwit payment address; on single-address
   * (keystore / UniSat / OKX) it's the one address.
   */
  btcFromAddresses: string[];
  /**
   * Dual-address browser wallets (Xverse / Leather / OYL) route
   * inscriptions/runes/alkanes to taproot — so a segwit payment-address
   * UTXO never carries them. On dual wallets we can include all
   * payment-address UTXOs without the inscription/rune/alkane filter.
   * Single-address wallets share an address for everything; the filter
   * stays on to avoid sending an alkane carrier as a BTC fee input.
   */
  isDualAddressBrowser: boolean;
}

function hasAny(field: SendModalFilterUtxo['alkanes' | 'runes' | 'inscriptions']): boolean {
  if (!field) return false;
  if (Array.isArray(field)) return field.length > 0;
  if (typeof field === 'object') return Object.keys(field).length > 0;
  return false;
}

/**
 * Returns the subset of UTXOs the Send Bitcoin modal can spend.
 *
 * Filter chain (preserved from the historical inline impl):
 *   1. confirmed (or our pending tx output)
 *   2. on a fee-source address
 *   3. not frozen (unless showFrozenUtxos)
 *   4. for single-address wallets: no inscription / rune / alkane payload
 */
export function selectAvailableUtxos(opts: SendModalFilterOptions): SendModalFilterUtxo[] {
  const {
    utxos,
    ourPendingTxids,
    frozenUtxos,
    showFrozenUtxos,
    btcFromAddresses,
    isDualAddressBrowser,
  } = opts;
  const btcFromSet = new Set(btcFromAddresses);
  return utxos.filter((utxo) => {
    if (!utxo.status.confirmed && !ourPendingTxids.has(utxo.txid)) return false;
    if (!btcFromSet.has(utxo.address)) return false;
    const utxoKey = `${utxo.txid}:${utxo.vout}`;
    if (frozenUtxos.has(utxoKey)) return showFrozenUtxos;
    if (!isDualAddressBrowser) {
      if (hasAny(utxo.inscriptions)) return false;
      if (hasAny(utxo.runes)) return false;
      if (hasAny(utxo.alkanes)) return false;
    }
    return true;
  });
}

/**
 * Convenience aggregation matching the historical inline display:
 *   `Available: <sumOfFilteredUtxoValuesInBtc>`
 */
export function sumAvailableSats(opts: SendModalFilterOptions): number {
  return selectAvailableUtxos(opts).reduce((sum, u) => sum + u.value, 0);
}
