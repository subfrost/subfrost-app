/**
 * unisat-ord proxy — POST batch outpoint lookup for inscription/rune state.
 *
 * The subkube `unisat-ord` deployment exposes `POST /outputs` taking
 * `["txid:vout", ...]` and returning `[Output | null, ...]` array-ordered.
 * Each `Output` has `inscriptions: InscriptionId[]` and `runes`. Per-outpoint
 * results are redis-cached with the outpoint epoch (24h TTL, bumped only on
 * reorg) — so a wallet's UTXO set typically hits warm cache after the first
 * fanout.
 *
 * This route is the public-facing CORS-bypassing proxy. The upstream defaults
 * to `https://mainnet.subfrost.io/ord` (the in-cluster service exposed via
 * ingress); override with `UNISAT_ORD_BASE_URL` for staging.
 *
 * Used by `queries/ordinalState.ts` → `useOrdinalSkipOutpoints` to compute
 * the "known clean" outpoint list that flows into the alkanes SDK via
 * `txContext.skipOutpoints`. The SDK skips its own ord round-trip for those
 * outpoints, cutting ~50ms × dust-UTXO-count from swap latency.
 *
 * Response shape passes through unchanged so callers see the upstream's
 * `inscriptions`/`runes` arrays directly. On upstream failure we return
 * `{ outpoints: [...], results: null }` rather than throwing — callers
 * (the React Query layer) treat null as "ord backend unavailable, fall back
 * to per-UTXO SDK queries" so the swap path stays functional.
 */
import { NextRequest, NextResponse } from 'next/server';

const UPSTREAM = process.env.UNISAT_ORD_BASE_URL ?? 'https://mainnet.subfrost.io/ord';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  let outpoints: unknown;
  try {
    outpoints = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(outpoints) || outpoints.some((o) => typeof o !== 'string')) {
    return NextResponse.json(
      { error: 'body must be a string[] of "txid:vout" outpoints' },
      { status: 400 },
    );
  }
  if (outpoints.length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/outputs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outpoints),
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { outpoints, results: null, upstreamStatus: upstream.status },
        { status: 200 },
      );
    }
    const results = await upstream.json();
    return NextResponse.json({ results });
  } catch (err) {
    console.warn('[api/ord/outputs] upstream failed:', err);
    return NextResponse.json({ outpoints, results: null }, { status: 200 });
  }
}
