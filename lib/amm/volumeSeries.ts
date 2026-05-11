/**
 * Daily fill-forward for cumulative AMM volume series.
 *
 * The upstream `ammdata.get_total_volume_amm` endpoint emits one point per
 * swap-event block (sparse). For a marketing-quality landing chart we want
 * one tick per UTC day, with gaps filled by the most-recent cumulative value
 * (cumulative volume is monotonic — "highest seen so far" == "value as of
 * end of this day").
 *
 * Without this, a multi-month low-volume gap renders as a single straight
 * segment between the two outer points, which is what the user reported on
 * staging on 2026-05-10.
 */

export interface DatedValue {
  /** ISO date string `YYYY-MM-DD` (UTC). */
  time: string;
  /** Cumulative USD value as of end of `time`. */
  value: number;
}

/**
 * Densify a sparse, sorted-ascending series of `(time, value)` points so
 * that every UTC day from the first point's date through `endDate` (inclusive)
 * has exactly one entry. Missing days inherit the most-recent prior value.
 *
 * Pure: no network, no clock. Caller supplies `endDate` (the renderer uses
 * `today` derived from `Date.now()`).
 *
 * Inputs:
 *   - `points` MUST be ASC-sorted by `time` and have unique `time` keys.
 *     (The caller's bucketing step already guarantees this.)
 *   - `endDate` ISO `YYYY-MM-DD` UTC; if earlier than the last point's date,
 *     the function still returns through the last point's date (won't truncate).
 *
 * If `points` is empty, returns `[]`.
 */
export function fillDailyForward(
  points: readonly DatedValue[],
  endDate: string,
): DatedValue[] {
  if (points.length === 0) return [];

  const startDate = points[0]!.time;
  const lastPointDate = points[points.length - 1]!.time;

  // The chart should always extend through "today" — but if `endDate` is
  // earlier (e.g. clock skew), at least extend to the last data point.
  const finalDate = endDate >= lastPointDate ? endDate : lastPointDate;

  const valueByDate = new Map<string, number>();
  for (const p of points) valueByDate.set(p.time, p.value);

  const out: DatedValue[] = [];
  let lastValue = points[0]!.value;
  let cursor = startDate;
  // Walk from the start date through finalDate inclusive, one UTC day at a
  // time. Use Date arithmetic in UTC to avoid DST / local-tz drift.
  while (cursor <= finalDate) {
    const explicit = valueByDate.get(cursor);
    if (explicit !== undefined) lastValue = explicit;
    out.push({ time: cursor, value: lastValue });
    cursor = nextUtcDay(cursor);
  }
  return out;
}

/** Add one UTC day to an ISO `YYYY-MM-DD` string. */
function nextUtcDay(iso: string): string {
  // ISO date strings parse as UTC midnight; +86_400_000 ms is exactly +1 day
  // (UTC has no DST). Slice back to YYYY-MM-DD.
  const ms = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  return new Date(ms + 86_400_000).toISOString().slice(0, 10);
}
