import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

export function useBtcBalance() {
  const { isConnected, getSpendableTotalBalance, address, network } = useWallet();

  console.log('[useBtcBalance] Hook called', {
    isConnected,
    address,
    network,
    enabled: Boolean(isConnected && address),
  });

  return useQuery<number>({
    queryKey: ['btc-balance', address, network],
    enabled: Boolean(isConnected && address),
    staleTime: 60_000,
    queryFn: async () => {
      console.log('[useBtcBalance] queryFn called');
      try {
        const satoshis = await getSpendableTotalBalance();
        console.log('[useBtcBalance] Got satoshis:', satoshis);
        return Number(satoshis || 0);
      } catch (err) {
        console.error('[useBtcBalance] Error:', err);
        return 0;
      }
    },
  });
}


