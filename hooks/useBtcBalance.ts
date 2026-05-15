/**
 * useBtcBalance — wallet's spendable BTC balance in satoshis.
 *
 * Derives from the same source as the Header (`useEnrichedWalletData`):
 *   - prefers the prewarmed `btcFast` snapshot (UniSat / wallet-cache
 *     fast path, already in memory by the time the user reaches any
 *     mutation surface)
 *   - falls back to the enriched `balances.bitcoin.spendable` aggregate
 *     when the fast path isn't available (keystore wallets, etc.)
 *
 * Previously called `sdkProvider.getEnrichedBalances` via
 * `getSpendableTotalBalance()` which routed through a different SDK
 * call shape than the header and returned 0 for keystore wallets where
 * the header source correctly returned the wallet's BTC. Single
 * source-of-truth for "what BTC does the user have to spend" is the
 * fix — verified live 2026-05-14: futures Investment-Amount form
 * displayed `Balance 0.000000 BTC` while the header correctly showed
 * `0.00096 BTC` for the same connected keystore wallet.
 */
import { useEnrichedWalletData } from './useEnrichedWalletData';

export function useBtcBalance() {
  const { balances, btcFast, isBtcFastLoading, isLoading } = useEnrichedWalletData();
  const hasFast = btcFast && btcFast.total > 0;
  const spendable = hasFast ? (btcFast?.spendable ?? 0) : (balances?.bitcoin?.spendable ?? 0);
  return {
    data: spendable,
    isLoading: hasFast ? isBtcFastLoading : isLoading,
  };
}
