'use client';

/**
 * IndexerSyncContext — surface "we're waiting for the indexer to catch up
 * to bitcoind" state to a global status widget.
 *
 * Background: alkane mutations refuse to submit while the SDK detects
 * metashrew is behind bitcoind (the broadcast path's internal
 * `waitForIndexer` would otherwise time out at 30s and bury the action
 * on "Building Transaction"). We used to throw "Indexer catching up,
 * try again in a moment." That forced the user to retry. Now the
 * mutation hooks call `waitForIndexerSync(...)` which polls until
 * `lag === 0`, then proceeds automatically. While polling, the hook
 * pushes status updates to this context, and `<IndexerSyncOverlay/>`
 * renders a live "Indexer catching up — N blocks behind, tip Y"
 * widget so the user knows the flow is alive.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface IndexerSyncStatus {
  /** What the wait is for — surfaced to the user. */
  label: string;
  /** Current metashrew height. */
  metashrewHeight: number;
  /** Current bitcoind tip. */
  bitcoindHeight: number;
  /** Blocks behind (bitcoind - metashrew). */
  lag: number;
  /** Wall time the wait started, for elapsed-display. */
  startedAt: number;
}

interface IndexerSyncCtx {
  status: IndexerSyncStatus | null;
  start: (label: string) => void;
  update: (heights: { metashrewHeight: number; bitcoindHeight: number; lag: number }) => void;
  finish: () => void;
}

const IndexerSyncContext = createContext<IndexerSyncCtx | null>(null);

export function IndexerSyncProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<IndexerSyncStatus | null>(null);

  const start = useCallback((label: string) => {
    setStatus({
      label,
      metashrewHeight: 0,
      bitcoindHeight: 0,
      lag: 0,
      startedAt: Date.now(),
    });
  }, []);

  const update = useCallback((heights: { metashrewHeight: number; bitcoindHeight: number; lag: number }) => {
    setStatus((prev) => (prev ? { ...prev, ...heights } : prev));
  }, []);

  const finish = useCallback(() => {
    setStatus(null);
  }, []);

  const value = useMemo<IndexerSyncCtx>(() => ({ status, start, update, finish }), [status, start, update, finish]);

  return <IndexerSyncContext.Provider value={value}>{children}</IndexerSyncContext.Provider>;
}

export function useIndexerSync(): IndexerSyncCtx {
  const ctx = useContext(IndexerSyncContext);
  if (!ctx) {
    // Fallback no-op so the hooks can call this even when the provider
    // hasn't been mounted yet (e.g. very early in app boot, or in unit
    // tests that don't wrap the tree). Mutations still proceed; only
    // the overlay won't render.
    return {
      status: null,
      start: () => {},
      update: () => {},
      finish: () => {},
    };
  }
  return ctx;
}
