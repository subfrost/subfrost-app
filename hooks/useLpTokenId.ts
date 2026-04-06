/**
 * useLpTokenId — discovers the DIESEL/frBTC LP token ID from the AMM factory.
 *
 * Queries FindExistingPoolId (opcode 2) on the AMM factory contract with
 * DIESEL (2:0) and frBTC (32:0) as the pair. Returns the pool's AlkaneId
 * which IS the LP token ID.
 *
 * This replaces the hardcoded '2:6' which only works on specific boot sequences.
 * The pool ID varies per devnet boot depending on the sequence counter.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { simulateCall, parseU128FromHex } from '@/utils/alkaneRpc';

export function useLpTokenId() {
  const { network } = useWallet();
  const config = getConfig(network || 'mainnet');
  const factoryId = config.ALKANE_FACTORY_ID;

  return useQuery({
    queryKey: ['lp-token-id', factoryId, network],
    enabled: !!factoryId && !!network,
    staleTime: 60_000, // Pool ID doesn't change after boot
    queryFn: async ({ signal }): Promise<string | null> => {
      if (!factoryId) return null;

      const [fBlock, fTx] = factoryId.split(':');
      // FindExistingPoolId: opcode 2, args: DIESEL(2,0), frBTC(32,0)
      const result = await simulateCall(network, fBlock, fTx, ['2', '2', '0', '32', '0'], signal);
      if (result.error || result.data.length < 64) return null;

      const poolBlock = Number(parseU128FromHex(result.data, 0));
      const poolTx = Number(parseU128FromHex(result.data, 16));
      if (poolBlock === 0 && poolTx === 0) return null;

      return `${poolBlock}:${poolTx}`;
    },
  });
}
