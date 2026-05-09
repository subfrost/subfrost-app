/**
 * Total AMM Volume API — proxies espo's `ammdata.get_total_volume_amm`.
 *
 * GET /api/amm-volume
 *
 * Returns a daily-bucketed cumulative AMM volume series in USD. The upstream
 * RPC paginates at 1000 points/page sorted ascending, so a single page only
 * covers ~28 days. We fetch all pages in parallel here, bucket by date, and
 * forward-fill missing days (cumulative volume is monotonic — a day with no
 * recorded events inherits the prior day's value). The browser receives a
 * tiny ~270-point series instead of ~7K raw event points.
 *
 * Upstream: https://api.alkanode.com/rpc method `ammdata.get_total_volume_amm`.
 * Override via env:
 *   ESPO_RPC_PRIMARY_URL    — primary JSON-RPC base. Default api.alkanode.com.
 *   ESPO_RPC_FALLBACK_URL   — fallback if primary page-1 fails. No default.
 */

import { NextResponse } from 'next/server';

const ESPO_RPC_PRIMARY = process.env.ESPO_RPC_PRIMARY_URL || 'https://api.alkanode.com/rpc';
const ESPO_RPC_FALLBACK = process.env.ESPO_RPC_FALLBACK_URL || '';

const UPSTREAM_TIMEOUT_MS = 8_000;
const PAGE_SIZE = 1000;
// Generous ceiling — currently ~8 pages of data exist (May 2026). Bump if the
// chart starts visibly clipping at the historical end.
const MAX_PAGES = 16;
const ASSUMED_SECONDS_PER_BLOCK = 600;

const FRESH_CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=300';

interface UpstreamPoint {
  height: number;
  value: string;
}
interface UpstreamPage {
  ok: boolean;
  scale?: string;
  unit?: string;
  latest?: { height: number; value: string } | null;
  points?: UpstreamPoint[];
}

async function fetchPage(url: string, page: number): Promise<UpstreamPage> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'ammdata.get_total_volume_amm',
      params: { limit: PAGE_SIZE, page },
      id: page,
    }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!resp.ok) throw new Error(`http ${resp.status} (${url}, page ${page})`);
  const j = await resp.json();
  if (j?.error) throw new Error(`rpc error: ${JSON.stringify(j.error)}`);
  if (!j?.result?.ok) throw new Error('rpc result not ok');
  return j.result as UpstreamPage;
}

async function fetchAllPages(url: string) {
  // Fire all pages in parallel. Individual page failures past page 1 are
  // tolerated (we just skip them) — only a page-1 failure is fatal here.
  const settled = await Promise.all(
    Array.from({ length: MAX_PAGES }, (_, i) =>
      fetchPage(url, i + 1).then(
        (p) => ({ ok: true as const, page: i + 1, p }),
        (err) => ({ ok: false as const, page: i + 1, err }),
      ),
    ),
  );

  const page1 = settled[0]!;
  if (!page1.ok) throw page1.err;

  const head = page1.p;
  const allPoints: UpstreamPoint[] = [];
  for (const r of settled) {
    if (r.ok && Array.isArray(r.p.points)) allPoints.push(...r.p.points);
  }

  return {
    points: allPoints,
    scale: head.scale ?? '10000000000000000',
    unit: head.unit ?? 'usd',
    latest: head.latest ?? null,
  };
}

function bucketByDay(
  rawPoints: UpstreamPoint[],
  latest: { height: number; value: string } | null,
  scaleFloat: number,
): { time: string; valueUsd: number }[] {
  const points = rawPoints
    .map((p) => ({ height: Number(p.height), valueUsd: Number(p.value) / scaleFloat }))
    .filter((p) => Number.isFinite(p.height) && Number.isFinite(p.valueUsd));

  const latestPt = latest
    ? { height: Number(latest.height), valueUsd: Number(latest.value) / scaleFloat }
    : null;

  if (!points.length && !latestPt) return [];

  // Estimate dates by anchoring `latest` to "now" and walking back at 600s/block.
  // Drift over months is well below the 1-day bucket granularity.
  const anchorHeight = latestPt?.height ?? points[points.length - 1]!.height;
  const anchorMs = Date.now();
  const heightToDate = (h: number): string => {
    const ms = anchorMs - (anchorHeight - h) * ASSUMED_SECONDS_PER_BLOCK * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  };

  // Bucket per ISO date — keep the highest cumulative value seen on that date.
  const byDate = new Map<string, number>();
  for (const p of points) {
    const t = heightToDate(p.height);
    const cur = byDate.get(t);
    if (cur === undefined || p.valueUsd > cur) byDate.set(t, p.valueUsd);
  }
  if (latestPt) {
    const today = heightToDate(latestPt.height);
    if (!byDate.has(today) || byDate.get(today)! < latestPt.valueUsd) {
      byDate.set(today, latestPt.valueUsd);
    }
  }

  const entries = Array.from(byDate.entries())
    .map(([time, valueUsd]) => ({ time, valueUsd }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));

  if (entries.length < 2) return entries;

  // Forward-fill missing days. Cumulative volume only increases, so a day with
  // no events inherits the prior day's value — without this the chart jumps
  // across empty intervals (e.g. Aug → today) instead of drawing a continuous
  // timeline.
  const ONE_DAY_MS = 86_400_000;
  const parseDay = (iso: string) =>
    Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    );

  const startMs = parseDay(entries[0]!.time);
  const endMs = parseDay(entries[entries.length - 1]!.time);

  const filled: { time: string; valueUsd: number }[] = [];
  let nextIdx = 0;
  let lastValue = entries[0]!.valueUsd;
  for (let cursor = startMs; cursor <= endMs; cursor += ONE_DAY_MS) {
    const t = new Date(cursor).toISOString().slice(0, 10);
    if (nextIdx < entries.length && entries[nextIdx]!.time === t) {
      lastValue = entries[nextIdx]!.valueUsd;
      nextIdx++;
    }
    filled.push({ time: t, valueUsd: lastValue });
  }
  return filled;
}

export async function GET() {
  try {
    let result: Awaited<ReturnType<typeof fetchAllPages>>;
    try {
      result = await fetchAllPages(ESPO_RPC_PRIMARY);
    } catch (primaryErr) {
      if (!ESPO_RPC_FALLBACK) throw primaryErr;
      console.warn(
        `[amm-volume] primary failed (${primaryErr instanceof Error ? primaryErr.message : 'unknown'}); falling back to ${ESPO_RPC_FALLBACK}`,
      );
      result = await fetchAllPages(ESPO_RPC_FALLBACK);
    }

    const scaleFloat = Number(BigInt(result.scale));
    const points = bucketByDay(result.points, result.latest, scaleFloat);
    const latest = result.latest
      ? {
          height: Number(result.latest.height),
          valueUsd: Number(result.latest.value) / scaleFloat,
        }
      : null;

    return NextResponse.json(
      { ok: true, unit: result.unit, latest, points },
      { headers: { 'Cache-Control': FRESH_CACHE_HEADER } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    console.error('[amm-volume] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
