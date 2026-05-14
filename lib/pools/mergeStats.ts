/**
 * Merge helpers for pool data overlays.
 *
 * Several home/swap surfaces derive a `PoolsListItem` by overlaying stats
 * from `useAllPoolStats()` onto the base entries from `usePools()`. The
 * common pattern was:
 *
 *   tvlUsd: pool.tvlUsd || stats?.tvlUsd || 0
 *
 * which silently short-circuits when `pool.tvlUsd === 0` — the OR returns
 * the zero immediately and never consults `stats?.tvlUsd`. Symptom on
 * staging 2026-05-10: DIESEL/frBTC TVL displayed as $0 in Markets despite
 * the stats overlay holding the correct $385K value.
 *
 * `pickPositive` returns the first finite, strictly-positive candidate.
 * Use this in place of `||` when you want a non-zero value to take priority
 * over a zero-from-primary.
 */

export function pickPositive(...candidates: Array<number | undefined | null>): number {
  for (const c of candidates) {
    if (c == null) continue;
    if (Number.isFinite(c) && c > 0) return c;
  }
  return 0;
}
