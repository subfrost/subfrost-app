/**
 * useTokenNames — Independent React Query that fetches token metadata
 * via the SDK WebProvider's dataApiGetAlkanes method.
 *
 * Returns a Map<alkaneId, { name, symbol }> covering the top 500 tokens.
 */
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

export type TokenNameEntry = { name: string; symbol: string };

async function fetchTokenNames(
  provider: any,
): Promise<Map<string, TokenNameEntry>> {
  const map = new Map<string, TokenNameEntry>();

  try {
    const result = await provider.dataApiGetAlkanes(BigInt(1), BigInt(500));
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const tokens: any[] = parsed?.data?.tokens || parsed?.tokens || [];

    for (const token of tokens) {
      const alkaneId = token.id
        ? `${token.id.block || 0}:${token.id.tx || 0}`
        : '';
      if (alkaneId && (token.name || token.symbol)) {
        map.set(alkaneId, { name: token.name || '', symbol: token.symbol || '' });
      }
    }

    console.log(`[useTokenNames] Loaded ${map.size} token names`);
  } catch (err) {
    console.warn('[useTokenNames] Failed to fetch token names:', err);
  }

  return map;
}

export function useTokenNames() {
  const { network } = useWallet();
  const { provider } = useAlkanesSDK();

  return useQuery({
    queryKey: ['tokenNames', network],
    staleTime: 5 * 60 * 1000, // 5 min — names rarely change
    gcTime: 30 * 60 * 1000, // keep in cache 30 min
    enabled: !!network && !!provider,
    queryFn: () => fetchTokenNames(provider),
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
