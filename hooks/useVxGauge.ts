import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';

async function fetchGaugeStats(gaugeId: string, network: string) {
  const [block, tx] = gaugeId.split(':');
  const resp = await fetch(`/api/rpc/${network}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_simulate',
      params: [{ target: { block, tx }, inputs: ['20'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
      id: 1,
    }),
  });
  const data = await resp.json();
  return { gaugeId, error: data?.result?.execution?.error || null };
}

export function useVxGauge(gaugeId: string | undefined) {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['vx-gauge', gaugeId, network],
    queryFn: () => fetchGaugeStats(gaugeId!, network || 'devnet'),
    enabled: !!gaugeId && !!network,
    staleTime: 30_000,
  });
}
