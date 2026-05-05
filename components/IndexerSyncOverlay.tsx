/**
 * Floating overlay that surfaces the indexer-catching-up state to the
 * user while a mutation hook is parked in `waitForIndexerSync`.
 *
 * Replaces the old "Indexer catching up — Try again in a moment" hard
 * error toast. Shows live lag + metashrew tip, refreshing every poll
 * cadence (~4s). When sync resolves, the hook calls `finish()` and the
 * overlay unmounts; the mutation proceeds automatically without a user
 * retry.
 *
 * Mounted in providers.tsx alongside <PendingTxHUD/>.
 */

'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useIndexerSync } from '@/context/IndexerSyncContext';

export function IndexerSyncOverlay() {
  const { status } = useIndexerSync();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!status) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - status.startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status]);

  if (!status) return null;

  const lagText =
    status.lag === 0
      ? 'Catching up…'
      : `${status.lag} block${status.lag === 1 ? '' : 's'} behind`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-40 left-1/2 -translate-x-1/2 top-4 md:top-6 max-w-[90vw]"
    >
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
        <Loader2 className="w-4 h-4 animate-spin text-[color:var(--sf-primary)] shrink-0" />
        <div className="flex flex-col text-sm">
          <span className="font-semibold text-[color:var(--sf-text)]">{status.label}</span>
          <span className="text-[color:var(--sf-text)]/70 tabular-nums text-xs">
            Indexer is {lagText}
            {status.bitcoindHeight > 0 && (
              <>
                {' '}· tip {status.metashrewHeight.toLocaleString()} / {status.bitcoindHeight.toLocaleString()}
              </>
            )}
            {elapsed > 0 && <> · {elapsed}s</>}
          </span>
        </div>
      </div>
    </div>
  );
}
