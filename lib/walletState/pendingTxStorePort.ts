/**
 * Minimal `PendingTxStore` interface used by `applyMempoolAdjustment`.
 *
 * The full trait + implementations live in:
 *   - `lib/alkanes/pendingTxStore.ts` (`IndexedDbPendingTxStore`)
 *   - `lib/alkanes/__tests__/pending-tx-store.test.ts` (`MemoryPendingTxStore`)
 *
 * This file exists so the wallet-state layer doesn't have to import a
 * test module to get the structural type. Anyone implementing this
 * surface (real IndexedDB store, in-memory test double, server-side
 * shim) is compatible with `withPendingAdjustment`.
 */

export interface PendingTxStore {
  list(): Promise<string[]>;
}
