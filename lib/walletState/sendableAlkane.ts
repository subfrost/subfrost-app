/**
 * Pure single-source-of-truth for "what can the user actually spend right now"
 * for a given alkane. Every USER-FACING INPUT (send modal, swap input,
 * liquidity input) MUST route through this helper.
 *
 * Background: mork1e reported 2026-05-18 (FB6) that the swap input was showing
 * his TOTAL alkane balance, not just the AVAILABLE portion — letting him try
 * to spend amounts already locked in mempool transactions. His exact spec:
 *
 *   "the user can only spend 'available' funds basically / which is why
 *    user facing inputs / like the swap inputs / or the transfer inputs /
 *    should only show the available state, not the total state"
 *
 *   "If the alkane lives in a utxo where its being spent, it is deducted
 *    from total / however much the utxo being spent owned of that alkane"
 *
 *   "eg: if i had 10k tortilla across 5 utxos / and i was spending a utxo
 *    that had 700 tortilla / available should be 9300 tortilla / and
 *    mempool should be 700 tortilla / and total should be 10k tortilla"
 *
 * The breakdown logic itself lives in
 * `app/wallet/components/alkaneBalanceBreakdown.ts` (the same pure helper the
 * AlkanesBalancesCard consumes). This shim adds:
 *   - a `totalRaw` field so callers can show "TOTAL: 10k / available: 9300
 *     / mempool: 700" — what mork wants to see on the wallet card
 *   - a `canSendAny` predicate so user-facing inputs can disable themselves
 *     instead of accepting input that will fail at broadcast
 */

import {
  getAlkaneAvailabilityBreakdown,
  parseRawBalanceSafe,
  type PendingAlkaneEntry,
} from '@/app/wallet/components/alkaneBalanceBreakdown';

export interface SendableAlkane {
  /** Raw confirmed balance from /api/wallet-state — matches "total" in mork's spec. */
  totalRaw: bigint;
  /** Amount the user can actually spend right now (total - mempool-locked). */
  availableRaw: bigint;
  /** Amount locked in pending mempool transactions (positive magnitude). */
  mempoolRaw: bigint;
  /** True when availableRaw > 0n — gate user-facing input UI on this. */
  canSendAny: boolean;
}

/**
 * Compute the spendable view for an alkane from its confirmed balance and any
 * pending-tx-derived delta.
 *
 * Inputs are explicit (not a wallet hook) so this is callable from:
 *   - React components via `getSendableAlkane(alkane.balance, pendingByAlkane.get(id))`
 *   - vitest pins
 *   - the headless harness (scripts/verify-display-mainnet.ts)
 */
export function getSendableAlkane(
  confirmedRawInput: string | bigint | null | undefined,
  pendingEntry: PendingAlkaneEntry | undefined,
): SendableAlkane {
  const totalRaw =
    typeof confirmedRawInput === 'bigint'
      ? confirmedRawInput
      : parseRawBalanceSafe(confirmedRawInput ?? '0');
  const { availableRaw, mempoolRaw } = getAlkaneAvailabilityBreakdown(totalRaw, pendingEntry);
  return {
    totalRaw,
    availableRaw,
    mempoolRaw,
    canSendAny: availableRaw > 0n,
  };
}
