import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

export function useFujinMarkets() {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['fujin-markets', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      const factoryId = (config as any).FUJIN_FACTORY_ID;
      if (!factoryId) return null;

      const [block, tx] = factoryId.split(':');
      const resp = await fetch(`/api/rpc/${network}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{ target: { block, tx }, inputs: ['4'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
          id: 1,
        }),
      });
      const data = await resp.json();
      return { factoryId, error: data?.result?.execution?.error || null };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
