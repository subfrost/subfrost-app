/**
 * useUserOrders — discovers open limit orders via ORD-{id} receipt tokens.
 *
 * Architecture: Order receipt tokens (ORD-{id}) are alkane NFTs minted to the
 * user's wallet on place_limit_order(). Each carries order metadata queryable
 * via GetAllDetails (opcode 23). We discover them via alkanes_protorunesbyaddress,
 * then staticcall each to read order details.
 *
 * This replaces the old approach that called opcode 25 (GetOpenOrderCount) which
 * only returned a global count, not per-user orders. The Carbine controller has
 * no per-user query — receipt tokens solve this.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import {
  parseU128FromHex,
  simulateCall,
  queryAlkanesAtAddress,
  ALKANE_FACTORY_BLOCK,
} from '@/utils/alkaneRpc';

export interface UserOrder {
  /** The order token's AlkaneId (e.g. "2:8") — needed for cancel */
  tokenId: string;
  orderId: number;
  side: number;
  price: string;
  amount: string;
  baseBlock: number;
  baseTx: number;
  quoteBlock: number;
  quoteTx: number;
}

export function useUserOrders(enabled: boolean = true) {
  const { network, account, isConnected } = useWallet();
  const taprootAddress = account?.taproot?.address;
  const config = getConfig(network || 'mainnet');
  const controllerId = (config as any).CARBINE_CONTROLLER_ID as string | undefined;

  return useQuery({
    queryKey: ['user-orders', taprootAddress, controllerId, network],
    enabled: enabled && !!taprootAddress && !!controllerId && !!network && isConnected,
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<UserOrder[]> => {
      if (!taprootAddress || !controllerId) return [];

      // Step 1: Find all alkane tokens at user's taproot address
      const tokens = await queryAlkanesAtAddress(network, taprootAddress, signal);

      // Step 2: Filter for order token candidates (block=2, amount=1)
      const candidates = tokens.filter(
        (t) => t.block === ALKANE_FACTORY_BLOCK && t.amount === 1n,
      );
      if (candidates.length === 0) return [];

      // Step 3: Batch-check registration + details for all candidates in parallel
      const [ctrlBlock, ctrlTx] = controllerId.split(':');

      const results = await Promise.all(
        candidates.map(async (cand): Promise<UserOrder | null> => {
          try {
            // IsRegisteredOrder (opcode 26) on the controller
            const reg = await simulateCall(
              network, ctrlBlock, ctrlTx,
              ['26', String(cand.block), String(cand.tx)],
              signal,
            );
            if (reg.error || reg.data.length < 32) return null;
            if (parseU128FromHex(reg.data, 0) !== 1n) return null;

            // GetAllDetails (opcode 23) on the order token
            const details = await simulateCall(
              network, String(cand.block), String(cand.tx),
              ['23'], signal,
            );
            if (details.error || details.data.length < 256) return null;

            const d = details.data;
            return {
              tokenId: `${cand.block}:${cand.tx}`,
              orderId: Number(parseU128FromHex(d, 0)),
              side: Number(parseU128FromHex(d, 16)),
              price: parseU128FromHex(d, 32).toString(),
              amount: parseU128FromHex(d, 48).toString(),
              baseBlock: Number(parseU128FromHex(d, 64)),
              baseTx: Number(parseU128FromHex(d, 80)),
              quoteBlock: Number(parseU128FromHex(d, 96)),
              quoteTx: Number(parseU128FromHex(d, 112)),
            };
          } catch {
            return null;
          }
        }),
      );

      return results.filter((o): o is UserOrder => o !== null);
    },
    retry: 2,
  });
}
