/**
 * Ordinal-state prefetch — batches the wallet's dust UTXOs to /api/ord/outputs
 * (proxied unisat-ord) and exposes the "known clean" outpoint subset.
 *
 * Why this exists: the alkanes-rs SDK's `ordinals_strategy: 'split'` (and
 * 'preserve') runs a per-UTXO unisat-ord query during PSBT build. For a
 * wallet with 30+ dust UTXOs that adds ~50ms × N to the click-to-popup
 * latency even with redis warm cache (sequential, single-threaded inside
 * the WASM). Prefetching the whole batch in parallel from the frontend
 * + passing the clean outpoints as `skip_outpoints` lets the SDK skip
 * those round-trips entirely.
 *
 * "Clean" means: no inscriptions, no runes. We only need to pass the clean
 * set as a hint — outpoints WITH inscriptions/runes still go through the
 * SDK's normal ord-check path so the split-tx can be built correctly.
 */
import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';

export interface OrdOutput {
  inscriptions?: string[];
  runes?: Record<string, unknown> | unknown[];
  value?: number;
  // Other fields pass through but we don't read them here.
  [k: string]: unknown;
}

export interface OrdinalStateResponse {
  /** Index-aligned with the request outpoints. `null` entries mean upstream
   *  had no data for that outpoint (also treated as "not clean"). Whole
   *  field is `null` when the unisat-ord backend itself was unavailable. */
  results: Array<OrdOutput | null> | null;
}

/**
 * Cheap, order-independent fingerprint for a set of outpoints. Used as the
 * query key so re-orders of the same set don't trigger a refetch.
 */
export function fingerprintOutpoints(outpoints: string[]): string {
  if (outpoints.length === 0) return 'empty';
  const sorted = [...outpoints].sort();
  let h = 0;
  for (const op of sorted) {
    for (let i = 0; i < op.length; i++) {
      h = ((h << 5) - h + op.charCodeAt(i)) | 0;
    }
  }
  return `${sorted.length}-${(h >>> 0).toString(36)}`;
}

/**
 * Derives the subset of outpoints with NO inscriptions AND NO runes. Safe
 * inputs: empty/`null` results yield `[]` (no skip hint — SDK falls back
 * to per-UTXO checks). Treats undefined/missing fields as "not clean" so
 * we never falsely tell the SDK an inscribed UTXO is safe.
 */
export function deriveCleanOutpoints(
  requestOutpoints: string[],
  response: OrdinalStateResponse | undefined,
): string[] {
  if (!response?.results) return [];
  const clean: string[] = [];
  for (let i = 0; i < requestOutpoints.length; i++) {
    const entry = response.results[i];
    if (!entry) continue;
    const inscriptions = Array.isArray(entry.inscriptions) ? entry.inscriptions : [];
    const runes = entry.runes;
    const hasRunes = Array.isArray(runes)
      ? runes.length > 0
      : runes && typeof runes === 'object'
        ? Object.keys(runes as Record<string, unknown>).length > 0
        : false;
    if (inscriptions.length === 0 && !hasRunes) clean.push(requestOutpoints[i]);
  }
  return clean;
}

interface OrdinalStateDeps {
  network: string;
  outpoints: string[];
  /** Disable on devnet/regtest — no ord backend hooked up there. */
  enabled: boolean;
}

export function ordinalStateQueryOptions(deps: OrdinalStateDeps) {
  const fingerprint = fingerprintOutpoints(deps.outpoints);
  return queryOptions<OrdinalStateResponse>({
    queryKey: queryKeys.account.ordinalState(deps.network, fingerprint),
    enabled: deps.enabled && deps.outpoints.length > 0,
    // unisat-ord's outpoint epoch only bumps on reorg; per-block tip
    // invalidation is handled by HeightPoller via the wallet-utxo-cache
    // invalidation (this query's key depends on that cache's outpoints).
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
    queryFn: async () => {
      const res = await fetch('/api/ord/outputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deps.outpoints),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        // Treat as "unavailable" — caller falls back to no-hint behavior.
        return { results: null };
      }
      return (await res.json()) as OrdinalStateResponse;
    },
  });
}
