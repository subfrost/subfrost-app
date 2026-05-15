/**
 * Module-level cache for the wallet's "known clean" outpoint set —
 * written by `<WalletStatePrewarmer/>` after every block-tip refresh, read
 * by `alkanesExecuteTyped` when no per-call / per-txContext override is set.
 *
 * Why this exists (vs threading through txContext or every mutation hook):
 *
 *   1. WalletProvider can't call `useOrdinalSkipOutpoints` directly — that
 *      hook calls `useWallet()` (and `useWalletUtxoCache()`), and calling
 *      `useWallet()` inside its own provider returns the unmounted default
 *      context, not the locally-being-computed state.
 *   2. Splitting into a sibling provider (TxContextProvider) is cleaner
 *      architecturally but forces every mutation hook to migrate from
 *      `useWallet().txContext` → `useTxContext()` (~20 call sites).
 *   3. The user's correctness requirement — "never query ord at PSBT
 *      construction time, the page must stay in sync ahead of time" —
 *      is about prefetch ALWAYS being on, not about who owns the data
 *      flow. A module-level snapshot mirrored from React Query satisfies
 *      that without forcing every mutation hook to opt in.
 *
 * Cross-tab consistency isn't needed — each tab maintains its own React
 * Query cache and prewarmer, so each tab's store reflects ITS own ord
 * state. (A user with two wallets open in two tabs would see two
 * independent snapshots; that matches the per-tab wallet identity.)
 *
 * Invariant: the contents of the store at any moment are a snapshot of a
 * past successful `useOrdinalSkipOutpoints(network)` resolution. If the
 * backend is unavailable, the prewarmer writes `[]` — execute falls back
 * to the SDK's per-UTXO ord queries (correct, just slower). If the
 * wallet disconnects, the prewarmer clears the store; new connections
 * will repopulate from scratch.
 */

let snapshot: string[] = [];
const subscribers = new Set<(value: string[]) => void>();

/**
 * Latest "known clean" outpoint list (`"txid:vout"` strings). Returns an
 * empty array when ord state is unknown — never throws.
 */
export function getOrdinalSkipOutpoints(): string[] {
  return snapshot;
}

/**
 * Called by `WalletStatePrewarmer` whenever `useOrdinalSkipOutpoints`
 * resolves. Replaces the snapshot atomically and notifies subscribers
 * — useful for tests and for future hooks that want reactive reads of
 * the store. Idempotent: writing the same list (deep-equal) is a no-op.
 */
export function setOrdinalSkipOutpoints(next: string[]): void {
  if (snapshot.length === next.length && snapshot.every((v, i) => v === next[i])) {
    return;
  }
  snapshot = next;
  for (const fn of subscribers) fn(snapshot);
}

/**
 * Subscribe to changes. Returns an unsubscribe function. Useful for
 * tests that want to assert the prewarmer wrote the right value.
 */
export function subscribeOrdinalSkipOutpoints(fn: (value: string[]) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Test-only — resets to empty without notifying. Call between tests. */
export function __resetOrdinalSkipStoreForTests(): void {
  snapshot = [];
  subscribers.clear();
}
