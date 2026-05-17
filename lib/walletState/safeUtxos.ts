/**
 * Metashrew-safe UTXO filter.
 *
 * Mutation hooks call this before constructing PSBTs to exclude UTXOs
 * the indexer hasn't seen yet. A UTXO at height N+1 when metashrew is
 * still at N is "confirmed" from bitcoind's perspective but spending it
 * fails mid-broadcast because:
 *
 *   1. The alkanes runtime resolves balances against the indexer state
 *      trie at submit time; the UTXO's protorune balance isn't
 *      registered yet → "Insufficient alkanes: have 0".
 *   2. The SDK's pre-broadcast sync gate refuses to broadcast while
 *      `metashrew_height < bitcoind_blockcount`, so the swap stalls
 *      on "Indexer sync timed out".
 *
 * This is the load-bearing safety check that lets the UI confidently
 * disable spends until the indexer catches up.
 *
 * Mempool UTXOs (blockHeight === null) are EXCLUDED for the same
 * reason — they're unindexed by definition.
 */

import type { WalletUtxo } from './fetchWalletState';

/**
 * Return only UTXOs metashrew has indexed (`blockHeight !== null &&
 * blockHeight <= metashrewHeight`). Mempool UTXOs are dropped.
 */
export function filterMetashrewSafe(
  utxos: WalletUtxo[],
  metashrewHeight: number,
): WalletUtxo[] {
  if (!Number.isFinite(metashrewHeight) || metashrewHeight <= 0) return [];
  return utxos.filter(
    (u) => u.blockHeight !== null && u.blockHeight <= metashrewHeight,
  );
}
