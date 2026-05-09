/**
 * Total AMM Volume API — proxies espo's `ammdata.get_total_volume_amm`.
 *
 * GET /api/amm-volume?limit=<n>
 *
 * Returns cumulative AMM volume time-series in USD (post-scaling). The
 * upstream espo module emits values as scaled bigints (`scale` field, default
 * 1e16) so we divide here and return plain JS numbers — consumers don't need
 * to know about the fixed-point encoding.
 *
 * Upstream: https://api.alkanode.com/rpc method `ammdata.get_total_volume_amm`.
 * Override via env:
 *   ESPO_RPC_PRIMARY_URL    — primary JSON-RPC base. Default api.alkanode.com.
 *   ESPO_RPC_FALLBACK_URL   — fallback if primary fails. No default; set to
 *                             enable an alternate alkanode/subfrost host.
 */

import { NextResponse } from 'next/server';

const ESPO_RPC_PRIMARY = process.env.ESPO_RPC_PRIMARY_URL || 'https://api.alkanode.com/rpc';
const ESPO_RPC_FALLBACK = process.env.ESPO_RPC_FALLBACK_URL || '';

const UPSTREAM_TIMEOUT_MS = 8_000;

const FRESH_CACHE_HEADER = 'public, s-maxage=30, stale-while-revalidate=300';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') || 1000), 5000);

  const callRpc = async (url: string) => {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'ammdata.get_total_volume_amm',
        params: { limit, page: 1 },
        id: 1,
      }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!resp.ok) throw new Error(`http ${resp.status} (${url})`);
    const j = await resp.json();
    if (j?.error) throw new Error(`rpc error: ${JSON.stringify(j.error)}`);
    if (!j?.result?.ok) throw new Error('rpc result not ok');
    return j.result;
  };

  try {
    let result: any;
    try {
      result = await callRpc(ESPO_RPC_PRIMARY);
    } catch (primaryErr) {
      if (!ESPO_RPC_FALLBACK) throw primaryErr;
      console.warn(`[amm-volume] primary failed (${primaryErr instanceof Error ? primaryErr.message : 'unknown'}); falling back to ${ESPO_RPC_FALLBACK}`);
      result = await callRpc(ESPO_RPC_FALLBACK);
    }

    // Pre-divide by scale so consumers get plain JS numbers in USD.
    const scaleBigInt = BigInt(result.scale || '10000000000000000');
    const scaleFloat = Number(scaleBigInt);

    const points = (result.points || [])
      .map((p: any) => ({
        height: Number(p.height),
        valueUsd: Number(p.value) / scaleFloat,
      }))
      .filter((p: any) => Number.isFinite(p.height) && Number.isFinite(p.valueUsd));

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
  } catch (e: any) {
    console.error('[amm-volume] failed:', e?.message || e);
    return NextResponse.json(
      { ok: false, error: e?.message || 'fetch failed' },
      { status: 502 },
    );
  }
}
