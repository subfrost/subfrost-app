import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getRpcUrl } from '@/utils/getConfig';

/**
 * Fetch a specific alkane token balance for the connected wallet.
 * Uses alkanes_protorunesbyaddress RPC (works on devnet + mainnet).
 * Pattern: VaultDetail.tsx lines 55-88.
 */
export function useAlkaneBalance(alkaneId: string | undefined) {
  const { account, network } = useWallet();
  const taprootAddress = account?.taproot?.address;

  return useQuery({
    queryKey: ['alkane-balance', taprootAddress, alkaneId, network],
    enabled: !!taprootAddress && !!alkaneId && !!network,
    staleTime: 10_000,
    queryFn: async () => {
      if (!taprootAddress || !alkaneId) return '0';
      const [targetBlock, targetTx] = alkaneId.split(':').map(Number);
      try {
        const rpcUrl = getRpcUrl(network);
        const resp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alkanes_protorunesbyaddress',
            params: [{ address: taprootAddress, protocolTag: '1' }],
            id: 1,
          }),
        });
        const json = await resp.json();
        let total = 0;
        for (const outpoint of json?.result?.outpoints || []) {
          const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
          for (const entry of balances) {
            if (parseInt(entry.block ?? '0') === targetBlock && parseInt(entry.tx ?? '0') === targetTx) {
              total += parseInt(entry.amount || '0');
            }
          }
        }
        return (total / 1e8).toFixed(8);
      } catch {
        return '0';
      }
    },
  });
}
