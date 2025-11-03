'use client';

import { useQuery } from '@tanstack/react-query';
import { useSandshrewProvider } from './useSandshrewProvider';
import { useWallet } from '../contexts/WalletContext';

export function useTotalBtcBalance(addresses?: string[]) {
  const provider = useSandshrewProvider();

  return useQuery({
    queryKey: ['totalBtcBalance', addresses?.join(',')],
    queryFn: async () => {
      if (!addresses || !addresses.length) return null;
      const uniqueAddresses = Array.from(new Set(addresses.filter(Boolean)));
      const response = await provider.sandshrew.multiCall(
        uniqueAddresses.map((address) => ['esplora_address', [address]]),
      );

      let confirmed = 0;
      let unconfirmed = 0;
      let total = 0;

      for (const { result } of response as any[]) {
        if (typeof result === 'string') continue;
        const confirmedBalance =
          result.chain_stats.funded_txo_sum - result.chain_stats.spent_txo_sum;
        const unconfirmedBalance =
          result.mempool_stats.funded_txo_sum - result.mempool_stats.spent_txo_sum;
        confirmed += confirmedBalance;
        unconfirmed += unconfirmedBalance;
        total += confirmedBalance + unconfirmedBalance;
      }

      return { confirmed, unconfirmed, total };
    },
  });
}

export function useBtcBalance() {
  const { getSpendableTotalBalance, address } = useWallet();
  return useQuery({
    queryKey: ['btcBalance', address],
    queryFn: async () => {
      const b = await getSpendableTotalBalance();
      return b;
    },
  });
}


