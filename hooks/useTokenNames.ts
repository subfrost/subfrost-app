/**
 * useTokenNames — Independent React Query that fetches token metadata
 * via the /api/token-names proxy (which calls /get-alkanes on the server).
 *
 * This avoids CORS issues that occur when fetching directly from
 * mainnet.subfrost.io in the browser.
 *
 * Returns a Map<alkaneId, { name, symbol }> covering the top 500 tokens.
 */
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

export type TokenNameEntry = { name: string; symbol: string };

async function fetchTokenNames(
  network: string,
): Promise<Map<string, TokenNameEntry>> {
  const map = new Map<string, TokenNameEntry>();

  try {
    const resp = await fetch(`/api/token-names?network=${encodeURIComponent(network)}&limit=500`);
    if (!resp.ok) {
      console.warn(`[useTokenNames] /api/token-names failed: ${resp.status}`);
      return map;
    }
    const data = await resp.json();
    const names: Record<string, { name: string; symbol: string }> = data?.names || {};

    for (const [alkaneId, entry] of Object.entries(names)) {
      map.set(alkaneId, entry as TokenNameEntry);
    }

    console.log(`[useTokenNames] Loaded ${map.size} token names`);
  } catch (err) {
    console.warn('[useTokenNames] Failed to fetch token names:', err);
  }

  return map;
}

export function useTokenNames() {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['tokenNames', network],
    staleTime: 5 * 60 * 1000, // 5 min — names rarely change
    gcTime: 30 * 60 * 1000, // keep in cache 30 min
    enabled: !!network,
    queryFn: () => fetchTokenNames(network),
  });
}

/**
 * Resolve a proper (non-numeric) name for a token.
 * Takes multiple data sources and returns the best available name.
 *
 * Priority: tokenNamesMap → idToUserCurrency → walletAlkaneNames → original
 */
const numericOnly = /^\d+$/;

export function resolveTokenDisplay(
  tokenId: string,
  currentSymbol: string,
  currentName: string | undefined,
  tokenNamesMap?: Map<string, TokenNameEntry>,
  idToUserCurrency?: Map<string, any>,
  walletAlkaneNames?: Map<string, { name: string; symbol: string }>,
): { symbol: string; name: string } {
  // If the current symbol is already a proper name, just ensure name is set
  if (!numericOnly.test(currentSymbol) && !currentSymbol.includes(':')) {
    return { symbol: currentSymbol, name: currentName || currentSymbol };
  }

  // Also check if name is already good (even if symbol is numeric)
  if (currentName && !numericOnly.test(currentName) && !currentName.includes(':')) {
    return { symbol: currentName, name: currentName };
  }

  // Priority 1: Bulk token metadata from /api/token-names (most reliable)
  if (tokenNamesMap) {
    const meta = tokenNamesMap.get(tokenId);
    if (meta) {
      const mSym = meta.symbol && !numericOnly.test(meta.symbol) ? meta.symbol : null;
      const mName = meta.name && !numericOnly.test(meta.name) ? meta.name : null;
      if (mSym || mName) return { symbol: mSym || mName!, name: mName || mSym! };
    }
  }

  // Priority 2: User currency data (useSellableCurrencies)
  if (idToUserCurrency) {
    const currency = idToUserCurrency.get(tokenId);
    const cSym = currency?.symbol && !numericOnly.test(currency.symbol) && !currency.symbol.includes(':')
      ? currency.symbol : null;
    const cName = currency?.name && !numericOnly.test(currency.name) && !currency.name.includes(':')
      ? currency.name : null;
    if (cSym || cName) return { symbol: cSym || cName!, name: cName || cSym! };
  }

  // Priority 3: Wallet alkane names (useEnrichedWalletData)
  if (walletAlkaneNames) {
    const wn = walletAlkaneNames.get(tokenId);
    const wSym = wn?.symbol && !numericOnly.test(wn.symbol) ? wn.symbol : null;
    const wName = wn?.name && !numericOnly.test(wn.name) ? wn.name : null;
    if (wSym || wName) return { symbol: wSym || wName!, name: wName || wSym! };
  }

  // Fallback: keep current values
  return { symbol: currentSymbol, name: currentName || currentSymbol };
}
