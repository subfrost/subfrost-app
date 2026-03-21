import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { queryKeys } from '@/queries/keys';

async function fetchDxBtcStats(network: string) {
  const config = getConfig(network || 'devnet');
  const vaultId = (config as any).DXBTC_VAULT_ID;
  if (!vaultId) return null;

  const [block, tx] = vaultId.split(':');
  const rpcUrl = `/api/rpc/${network}`;

  const resp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'alkanes_simulate',
      params: [{ target: { block, tx }, inputs: ['101'], alkanes: [], transaction: '0x', block: '0x', height: '999999', txindex: 0, vout: 0 }],
      id: 1,
    }),
  });
  const data = await resp.json();
  const totalSupply = data?.result?.execution?.data
    ? BigInt('0x' + data.result.execution.data.replace('0x', '').slice(0, 32) || '0')
    : 0n;

  return { totalSupply: totalSupply.toString(), vaultId };
}

export function useDxBtcVault() {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['dxbtc-vault', network],
    queryFn: () => fetchDxBtcStats(network || 'devnet'),
    enabled: !!network,
    staleTime: 30_000,
  });
}
