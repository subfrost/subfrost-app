/**
 * Total AMM Volume API — proxies espo's `ammdata.get_total_volume_amm`.
 *
 * GET /api/amm-volume?limit=<n>&maxPages=<m>
 *
 * Returns cumulative AMM volume time-series in USD (post-scaling). The
 * upstream espo module emits values as scaled bigints (`scale` field, default
 * 1e16) so we divide here and return plain JS numbers — consumers don't need
 * to know about the fixed-point encoding.
 *
 * ## Pagination
 *
 * Upstream returns points in forward chronological order starting from the
 * oldest swap event. A single page of 1000 only covers ~4000 blocks (~28
 * days). Without pagination the chart shows a flat line at last-page-value
 * for ~9 months and then jumps to `latest` on today's bucket — exactly the
 * "shoots straight up" symptom reported on staging 2026-05-10.
 *
 * We page forward until either (a) we've reached `latest.height`, or (b)
 * we've hit `maxPages` (default 50, cap 200). Each page is one upstream
 * call. The Vercel CDN caches the assembled series for 30s with SWR.
 *
 * Upstream: https://api.alkanode.com/rpc method `ammdata.get_total_volume_amm`.
 * Single upstream, no fallback (per flex 2026-05-11). Override the host via
 * ESPO_RPC_URL if alkanode itself goes down.
 */

import { NextResponse } from 'next/server';

const ESPO_RPC_PRIMARY =
  process.env.ESPO_RPC_URL ||
  process.env.ESPO_RPC_PRIMARY_URL ||
  'https://api.alkanode.com/rpc';

const UPSTREAM_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_PAGES = 50;
const HARD_CAP_PAGES = 200;

const FRESH_CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=300';

interface RawPoint { height: number | string; value: string | number; }
interface RawResult {
  ok?: boolean;
  scale?: string | number;
  unit?: string;
  points?: RawPoint[];
  latest?: { height: number | string; value: string | number };
  has_more?: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 1000), 5000);
  const maxPages = Math.min(
    Number(searchParams.get('maxPages') || DEFAULT_MAX_PAGES),
    HARD_CAP_PAGES,
  );

  const callRpcPage = async (url: string, page: number): Promise<RawResult> => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'ammdata.get_total_volume_amm',
        params: { limit, page },
        id: page,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!resp.ok) throw new Error(`http ${resp.status} (${url} page=${page})`);
    const j = await resp.json();
    if (j?.error) throw new Error(`rpc error page=${page}: ${JSON.stringify(j.error)}`);
    if (!j?.result?.ok) throw new Error(`rpc result not ok page=${page}`);
    return j.result as RawResult;
  };

  try {
    // Page 1 establishes the scale + latest anchor. Subsequent pages reuse
    // the same scale (it's a per-result invariant set by the server's
    // ammdata module). Single upstream — no fallback (per flex 2026-05-11:
    // "we should never have more than 1 way to do something").
    const activeUrl = ESPO_RPC_PRIMARY;
    const result: RawResult = await callRpcPage(ESPO_RPC_PRIMARY, 1);

    const scaleBigInt = BigInt(result.scale || '10000000000000000');
    const scaleFloat = Number(scaleBigInt);

    const allRaw: RawPoint[] = [...(result.points || [])];
    const latestHeight = result.latest ? Number(result.latest.height) : null;

    // Walk forward until we cover the gap between the last point we have
    // and `latest.height`. Stop when:
    //   - server says no more pages
    //   - we've reached or surpassed the latest anchor
    //   - we've spent maxPages calls
    //   - a page returns zero new points (defensive against server quirks)
    let page = 2;
    while (page <= maxPages) {
      const lastHaveHeight = allRaw.length > 0
        ? Number(allRaw[allRaw.length - 1]!.height)
        : null;
      if (
        latestHeight != null
        && lastHaveHeight != null
        && lastHaveHeight >= latestHeight
      ) break;
      if (result.has_more === false) break;
      let nextPage: RawResult;
      try {
        nextPage = await callRpcPage(activeUrl, page);
      } catch (err) {
        console.warn(`[amm-volume] page ${page} failed (${err instanceof Error ? err.message : 'unknown'}); stopping pagination at page ${page - 1}`);
        break;
      }
      const newPts = nextPage.points || [];
      if (newPts.length === 0) break;
      allRaw.push(...newPts);
      result.has_more = nextPage.has_more;
      page += 1;
    }

    const points = allRaw
      .map((p) => ({
        height: Number(p.height),
        valueUsd: Number(p.value) / scaleFloat,
      }))
      .filter((p) => Number.isFinite(p.height) && Number.isFinite(p.valueUsd));

    const latest = result.latest
      ? {
          height: Number(result.latest.height),
          valueUsd: Number(result.latest.value) / scaleFloat,
        }
      : null;

    return NextResponse.json(
      {
        ok: true,
        unit: result.unit || 'usd',
        latest,
        points,
      },
      { headers: { 'Cache-Control': FRESH_CACHE_HEADER } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    console.error('[amm-volume] failed:', msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 502 },
    );
  }
}
