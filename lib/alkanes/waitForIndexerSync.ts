/**
 * Poll metashrew + bitcoind heights until metashrew catches up
 * (lag === 0). Used by every alkane mutation hook in place of the old
 * "Indexer catching up — try again in a moment" hard-throw.
 *
 * Why polling at the app layer rather than relying on the WASM SDK's
 * internal `waitForIndexer`:
 *   - The SDK's wait has a fixed ~30s budget and surfaces a buried
 *     "Indexer sync timed out" if exceeded — visible to the user as a
 *     mid-flight crash.
 *   - The app-layer wait is unbounded (caller-cancellable), reports
 *     incremental progress, and proceeds automatically the moment
 *     sync resolves.
 *
 * Skip on local networks (devnet/regtest) — the user mines blocks
 * manually there, so a sync gap means "we're paused waiting for you
 * to mine," not a mainnet indexer lagging.
 */

import { getRpcUrl } from '@/utils/getConfig';

const LOCAL_NETWORKS = new Set(['devnet', 'regtest-local', 'qubitcoin-regtest']);

export interface SyncProgress {
  metashrewHeight: number;
  bitcoindHeight: number;
  lag: number;
}

export interface WaitForIndexerOpts {
  /** Network identifier (e.g. "mainnet", "subfrost-regtest"). */
  network: string;
  /** Called every poll with the current heights. UI uses this to update
   *  the IndexerSyncOverlay copy in real time. */
  onProgress?: (p: SyncProgress) => void;
  /** Cancellation. Throws DOMException("AbortError") on abort. */
  signal?: AbortSignal;
  /** Poll cadence. Default 4s — matches `syncStatusQueryOptions`'s
   *  `refetchInterval` so we don't out-poll the rest of the app. */
  intervalMs?: number;
}

async function fetchHeights(network: string, signal?: AbortSignal): Promise<SyncProgress> {
  const url = getRpcUrl(network);
  const rpc = async (method: string): Promise<number> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal,
    });
    if (!res.ok) throw new Error(`${method} ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`${method}: ${json.error.message ?? 'rpc error'}`);
    const r = json.result;
    return typeof r === 'string' ? parseInt(r, 10) : Number(r ?? 0);
  };
  const [metashrewHeight, bitcoindHeight] = await Promise.all([
    rpc('metashrew_height').catch(() => 0),
    rpc('btc_getblockcount').catch(() => 0),
  ]);
  const lag = Math.max(0, bitcoindHeight - metashrewHeight);
  return { metashrewHeight, bitcoindHeight, lag };
}

/**
 * Resolves once metashrew height >= bitcoind height. Calls `onProgress`
 * on every poll (including the first). Returns immediately on local
 * networks. Throws on signal abort.
 */
export async function waitForIndexerSync(opts: WaitForIndexerOpts): Promise<SyncProgress> {
  const { network, onProgress, signal, intervalMs = 4_000 } = opts;
  if (LOCAL_NETWORKS.has(network)) {
    // Local networks: caller is responsible for mining; never block.
    return { metashrewHeight: 0, bitcoindHeight: 0, lag: 0 };
  }

  // First poll up front so the overlay shows real numbers immediately.
  let progress = await fetchHeights(network, signal);
  onProgress?.(progress);

  while (progress.bitcoindHeight > 0 && progress.lag > 0) {
    if (signal?.aborted) {
      throw new DOMException('Indexer wait aborted', 'AbortError');
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Indexer wait aborted', 'AbortError'));
        }, { once: true });
      }
    });
    progress = await fetchHeights(network, signal);
    onProgress?.(progress);
  }

  return progress;
}
