import { useQuery } from '@tanstack/react-query';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';
import { useApiProvider } from '@/hooks/useApiProvider';

export const useSellableCurrencies = (
  walletAddress?: string,
  tokensWithPools?: { id: string; name?: string }[],
) => {
  const api = useApiProvider();
  // In regtest mode, return empty data since OYL API isn't available
  const isRegtest = process.env.NEXT_PUBLIC_NETWORK === 'regtest';
  
  return useQuery({
    queryKey: ['sellable-currencies', walletAddress, tokensWithPools],
    staleTime: 1000 * 60 * 2,
    enabled: !isRegtest && !!walletAddress, // Disable query in regtest mode
    queryFn: async (): Promise<CurrencyPriceInfoResponse[]> => {
      if (!walletAddress || isRegtest) return [];

      const response = await api.getAlkanesTokensByAddress({ address: walletAddress });

      const allAlkanes = response
        .filter(({ name }: any) => name && name !== '' && !name.includes('LP (OYL)'))
        .filter(({ name }: any) => name !== '{REVERT}' && !name.endsWith(' LP'))
        .map(({ alkaneId, name, symbol, balance, busdPoolPriceInUsd, floorPrice, idClubMarketplace }: any) => {
          const price = idClubMarketplace ? parseFloat(floorPrice) : busdPoolPriceInUsd;
          return {
            id: `${alkaneId.block}:${alkaneId.tx}`,
            address: walletAddress,
            name,
            symbol,
            balance,
            priceInfo: {
              price,
              idClubMarketplace,
            },
          } as CurrencyPriceInfoResponse;
        })
        .filter((alkane: any) => (tokensWithPools ? tokensWithPools.some((p) => p.id === alkane.id) : true));

      allAlkanes.sort((a: any, b: any) => {
        if (a.balance === b.balance) return (a.name || '').localeCompare(b.name || '');
        return a.balance > b.balance ? -1 : 1;
      });

      return allAlkanes;
    },
  });
};


