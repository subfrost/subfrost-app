import { useQuery } from '@tanstack/react-query';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

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
        const enriched = await provider.getEnrichedBalances(walletAddress, '1');

        const allAlkanes: CurrencyPriceInfoResponse[] = [];

        // Process alkane tokens from enriched balances
        if (enriched && enriched.assets) {
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
