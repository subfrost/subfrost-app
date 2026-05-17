/**
 * Pure helpers for splitting an alkane balance into "available" vs "mempool"
 * for the wallet UI.
 *
 * 2026-05-17 incident (mork1e, FROST Batallion 6 screenshot): the wallet
 * page on staging/prod was showing the user's entire confirmed alkane
 * balance as "mempool" (TORTILLA 84,439 / FARTANE 1.65B / frBTC 0.000106)
 * even though mork's address had ZERO pending mempool tx activity. Root
 * cause was the heuristic
 *
 *   mempoolRaw = max(0, confirmedRaw - availableRaw)
 *
 * where `availableRaw = spendableByAlkane.get(alkaneId)?.balance`. The
 * intent was "any confirmed balance the UTXO-cache path doesn't see must
 * be in flight in the mempool." But the heuristic falls apart in many
 * non-mempool cases:
 *
 *   - The two data sources (`alkaneQuery.data` address-keyed view and
 *     `walletUtxoCache.balances` UTXO-keyed aggregation) can disagree on
 *     individual alkane IDs purely because of indexer-lag / dust-probe
 *     coverage / per-source filtering. In mork's case the
 *     espoAlkanesFromWalletCache projection silently dropped TORTILLA
 *     because the wallet-state route's dust-fanout didn't include that
 *     outpoint at probe time → spendable map had no entry → availableRaw
 *     defaulted to 0 → "100% of TORTILLA is in mempool", which is false.
 *
 *   - Aggregator endpoints can flap (espo, alkanode) and return short or
 *     empty arrays; the heuristic treats that as "everything is pending"
 *     instead of "we don't know."
 *
 *   - A user with no pending tx and no UI action that would create one
 *     sees a panic-inducing "mempool: <large number>" label after a route
 *     transition. UX trust bomb, mirrors the c12 incident class.
 *
 * The fix: treat the EXPLICIT pending-tx-derived `pendingByAlkane` map as
 * the only source of truth for mempool deltas. Inferring from a delta of
 * two aggregations is always wrong because the aggregations can disagree
 * for reasons that have nothing to do with the mempool.
 */

import type { AlkaneAsset } from '@/queries/account';

export interface AvailabilityBreakdown {
  /** Confirmed + spendable subunits of this alkane. */
  availableRaw: bigint;
  /** Subunits incoming-pending from known mempool transactions (NEVER
   *  derived from a delta-of-aggregations heuristic — that misclassifies
   *  data-source mismatches as pending and panics users). 0 when no
   *  pending tx is recorded that adds this alkane. */
  mempoolRaw: bigint;
}

export interface PendingAlkaneEntry {
  /** Signed sub-unit delta from pending txs. Positive = incoming, negative = outgoing. */
  delta: bigint;
  uncertain?: boolean;
}

export function parseRawBalanceSafe(balance?: string | null): bigint {
  if (!balance) return 0n;
  try {
    return BigInt(balance);
  } catch {
    return 0n;
  }
}

/**
 * Compute (available, mempool) for an alkane.
 *
 * Inputs:
 *   confirmedRaw  — what the indexer reports as confirmed for this alkane
 *   pendingEntry  — pending-tx-derived delta for this alkane, or undefined.
 *                   `delta` is SIGNED — positive = incoming (buy/wrap),
 *                   negative = outgoing (sell/unwrap/send).
 *
 * Semantics:
 *
 *   No pending tx:        available=confirmed,  mempool=0
 *   Pending incoming +N:  available=confirmed,  mempool=+N
 *   Pending outgoing -N:  available=max(0, confirmed-N), mempool=N
 *
 * Both directions surface as a single `mempoolRaw` magnitude so the
 * existing UI consumer (`AlkanesBalancesCard`'s "mempool: X" label)
 * works unchanged. The directional context is implicit from the diff
 * between availableRaw and confirmedRaw — if outgoing, available drops;
 * if incoming, available is unchanged but mempool > 0.
 *
 * 2026-05-17 incident — TWO iterations:
 *   Iter 1: removed buggy `confirmedRaw - availableRaw` heuristic that
 *           panicked users with "mempool: <full balance>" when there
 *           was no pending tx. Only incoming deltas counted as mempool;
 *           outgoing-swap pending was silently invisible.
 *   Iter 2 (THIS REV): mork1e tested staging and reported "now when it's
 *           in mempool, [the swap] no longer appears in mempool". The
 *           "vanishing pending" was the outgoing side — confirmed
 *           balance was shown as fully spendable even while a pending
 *           swap was draining it. Now both directions render correctly.
 */
export function getAlkaneAvailabilityBreakdown(
  confirmedRaw: bigint,
  pendingEntry: PendingAlkaneEntry | undefined,
): AvailabilityBreakdown {
  const delta = pendingEntry?.delta ?? 0n;
  if (delta === 0n) {
    return { availableRaw: confirmedRaw, mempoolRaw: 0n };
  }
  if (delta > 0n) {
    // Pending incoming — confirmed stays spendable, mempool surfaces the
    // soon-to-arrive amount as a separate line.
    return { availableRaw: confirmedRaw, mempoolRaw: delta };
  }
  // delta < 0n — pending outgoing: subtract locked amount from spendable,
  // surface as mempool magnitude so the user sees the lockup.
  const lockedRaw = -delta;
  const availableRaw = confirmedRaw > lockedRaw ? confirmedRaw - lockedRaw : 0n;
  return { availableRaw, mempoolRaw: lockedRaw };
}

/**
 * BTC-side breakdown — preserved as-is; the BTC heuristic uses the
 * `btcFast` pendingIn/pendingOut fields directly, which ARE pending-tx
 * derived (per `btcBalanceFastQueryOptions`). Exposed here only so the
 * component's `getAvailabilityBreakdown` can dispatch through one entry
 * point.
 */
export function getBtcAvailabilityBreakdown(
  btcAvailableSats: number,
  btcMempoolSats: number,
): AvailabilityBreakdown {
  return {
    availableRaw: BigInt(Math.max(0, btcAvailableSats)),
    mempoolRaw: BigInt(Math.max(0, btcMempoolSats)),
  };
}

/**
 * Drop-in adapter for the existing `AlkanesBalancesCard.getAvailabilityBreakdown`
 * call sites — keeps the consumer signature stable while the underlying
 * logic moves into this module.
 */
export function getAvailabilityBreakdownFor(params: {
  alkane: AlkaneAsset;
  pendingByAlkane: Map<string, PendingAlkaneEntry>;
  isBitcoinAsset: boolean;
  btcAvailableSats: number;
  btcMempoolSats: number;
}): AvailabilityBreakdown {
  if (params.isBitcoinAsset) {
    return getBtcAvailabilityBreakdown(params.btcAvailableSats, params.btcMempoolSats);
  }
  const confirmedRaw = parseRawBalanceSafe(params.alkane.balance);
  const pendingEntry = params.pendingByAlkane.get(params.alkane.alkaneId);
  return getAlkaneAvailabilityBreakdown(confirmedRaw, pendingEntry);
}
