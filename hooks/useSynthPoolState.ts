import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

export function useSynthPoolState() {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['synth-pool-state', network],
    queryFn: async () => {
      const config = getConfig(network || 'devnet');
      const poolId = (config as any).SYNTH_POOL_ID;
      if (!poolId) return null;

      const [block, tx] = poolId.split(':');
      const resp = await fetch(`/api/rpc/${network}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_simulate',
          params: [{ target: { block, tx }, inputs: ['100'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
          id: 1,
        }),
      });
      const data = await resp.json();
      const hasLiquidity = !data?.result?.execution?.error;
      return { poolId, hasLiquidity };
    },
    enabled: !!network,
    staleTime: 30_000,
  });
}
