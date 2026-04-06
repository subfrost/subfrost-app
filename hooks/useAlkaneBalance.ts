import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getAlkaneTokenBalance } from '@/utils/alkaneRpc';

/**
 * Fetch a specific alkane token balance for the connected wallet.
 * Uses alkanes_protorunesbyaddress RPC (works on devnet + mainnet).
 */
export function useAlkaneBalance(alkaneId: string | undefined) {
  const { account, network } = useWallet();
  const taprootAddress = account?.taproot?.address;

  return useQuery({
    queryKey: ['alkane-balance', taprootAddress, alkaneId, network],
    enabled: !!taprootAddress && !!alkaneId && !!network,
    staleTime: 10_000,
    queryFn: async ({ signal }) => {
      if (!taprootAddress || !alkaneId) return '0';
      try {
        const total = await getAlkaneTokenBalance(network, taprootAddress, alkaneId, signal);
        return (Number(total) / 1e8).toFixed(8);
      } catch {
        return '0';
      }
    },
  });
}
