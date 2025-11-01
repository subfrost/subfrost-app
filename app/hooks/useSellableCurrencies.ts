'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiProvider } from './useApiProvider';
import type { CurrencyPriceInfoResponse } from '../types/alkanes';

export function useSellableCurrencies(walletAddress?: string) {
  const api = useApiProvider();

  return useQuery<CurrencyPriceInfoResponse[]>({
    queryKey: ['sellable-currencies', walletAddress],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!walletAddress) return [] as CurrencyPriceInfoResponse[];

      const response = await api.getAlkanesTokensByAddress({ address: walletAddress });

      const allAlkanes: CurrencyPriceInfoResponse[] = response
        .filter(({ name }: any) => name && name !== '' && !name.includes('LP (OYL)'))
        .filter(({ name }: any) => name !== '{REVERT}' && !name.endsWith(' LP'))
        .map((t: any) => {
          const price = t.idClubMarketplace ? parseFloat(t.floorPrice) : t.busdPoolPriceInUsd;
          return {
            id: `${t.alkaneId.block}:${t.alkaneId.tx}`,
            address: walletAddress,
            name: t.name,
            symbol: t.symbol,
            balance: t.balance,
            priceInfo: { price, idClubMarketplace: t.idClubMarketplace },
          } as CurrencyPriceInfoResponse;
        });

      allAlkanes.sort((a, b) => {
        if ((a.balance || '0') === (b.balance || '0')) return a.name.localeCompare(b.name);
        return Number(b.balance || '0') - Number(a.balance || '0');
      });

      return allAlkanes;
    },
  });
}


