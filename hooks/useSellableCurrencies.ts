import { useQuery } from '@tanstack/react-query';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

// Helper to recursively convert Map to plain object (serde_wasm_bindgen returns Maps)
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

// Helper to extract enriched data from WASM provider response
function extractEnrichedData(rawResult: any): { spendable: any[]; assets: any[]; pending: any[] } | null {
  if (!rawResult) return null;

  let enrichedData: any;
  if (rawResult instanceof Map) {
    const returns = rawResult.get('returns');
    enrichedData = mapToObject(returns);
  } else {
    enrichedData = rawResult?.returns || rawResult;
  }

  if (!enrichedData) return null;

  const toArray = (val: any): any[] => {
    if (Array.isArray(val)) return val.map(mapToObject);
    if (val && typeof val === 'object' && Object.keys(val).length > 0) {
      return Object.values(val).map(mapToObject);
    }
    return [];
  };

  return {
    spendable: toArray(enrichedData.spendable),
    assets: toArray(enrichedData.assets),
    pending: toArray(enrichedData.pending),
  };
}

export const useSellableCurrencies = (
  walletAddress?: string,
  tokensWithPools?: { id: string; name?: string }[],
) => {
  const { provider, isInitialized } = useAlkanesSDK();

  return useQuery({
    queryKey: ['sellable-currencies', walletAddress, tokensWithPools],
    staleTime: 1000 * 60 * 2,
    enabled: isInitialized && !!provider && !!walletAddress,
    queryFn: async (): Promise<CurrencyPriceInfoResponse[]> => {
      if (!walletAddress || !provider) return [];

      try {
        // Use WASM provider to get enriched balances which includes alkane tokens
        const rawResult = await provider.getEnrichedBalances(walletAddress, '1');
        const enriched = extractEnrichedData(rawResult);

        const allAlkanes: CurrencyPriceInfoResponse[] = [];

        // Process alkane tokens from enriched balances (asset UTXOs contain runes/alkanes)
        if (enriched && enriched.assets.length > 0) {
          for (const asset of enriched.assets) {
            // Skip LP tokens and invalid entries
            const name = asset.name || asset.token_name || '';
            if (!name || name === '' || name.includes('LP (OYL)') || name === '{REVERT}' || name.endsWith(' LP')) {
              continue;
            }

            const alkaneId = asset.alkane_id || asset.alkaneId;
            if (!alkaneId) continue;

            const id = typeof alkaneId === 'string'
              ? alkaneId
              : `${alkaneId.block}:${alkaneId.tx}`;

            // Check if token is in the allowed pools list
            if (tokensWithPools && !tokensWithPools.some((p) => p.id === id)) {
              continue;
            }

            allAlkanes.push({
              id,
              address: walletAddress,
              name: name.replace('SUBFROST BTC', 'frBTC'),
              symbol: asset.symbol || '',
              balance: asset.balance || asset.value || '0',
              priceInfo: {
                price: asset.busdPoolPriceInUsd || asset.priceUsd || 0,
                idClubMarketplace: asset.idClubMarketplace || false,
              },
            });
          }
        }

        // Sort by balance descending, then by name
        allAlkanes.sort((a, b) => {
          const balanceA = typeof a.balance === 'string' ? parseFloat(a.balance) : (a.balance ?? 0);
          const balanceB = typeof b.balance === 'string' ? parseFloat(b.balance) : (b.balance ?? 0);
          if (balanceA === balanceB) return (a.name || '').localeCompare(b.name || '');
          return balanceA > balanceB ? -1 : 1;
        });

        return allAlkanes;
      } catch (error) {
        console.error('[useSellableCurrencies] Error:', error);
        return [];
      }
    },
  });
};
