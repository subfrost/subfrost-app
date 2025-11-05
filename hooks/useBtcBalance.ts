import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

export function useBtcBalance() {
  const { isConnected, getSpendableTotalBalance, address, network } = useWallet();

  return useQuery<number>({
    queryKey: ['btc-balance', address, network],
    enabled: Boolean(isConnected && address),
    staleTime: 60_000,
    queryFn: async () => {
      try {
        const satoshis = await getSpendableTotalBalance();
        return Number(satoshis || 0);
      } catch {
        return 0;
      }
    },
  });
}


