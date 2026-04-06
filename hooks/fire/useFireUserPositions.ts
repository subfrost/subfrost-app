/**
 * useFireUserPositions — discovers FIRE staking positions via receipt tokens.
 *
 * Architecture: Position tokens (POS-{id}) are alkane NFTs minted to the user's
 * wallet on stake(). Each carries all position data queryable via GetAllDetails
 * (opcode 23). We discover them via alkanes_protorunesbyaddress, then staticcall
 * each to read position details.
 *
 * This replaces the old approach that called simulate with opcode 10 (GetUserPositions)
 * which required context.caller — broken because context.caller = {0,0} for all users.
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

export interface StakingPosition {
  /** The position token's AlkaneId (e.g. "2:5") — used as the unique key */
  tokenId: string;
  positionId: number;
  depositAmount: string;
  weightedAmount: string;
  lockEnd: number;
  lockDuration: number;
  multiplier: number;
  rewardCheckpoint: string;
  depositTokenBlock: number;
  depositTokenTx: number;
}

export function useFireUserPositions(enabled: boolean = true) {
  const { network, isConnected, account } = useWallet();
  const taprootAddress = account?.taproot?.address;
  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireUserPositions', taprootAddress, stakingId, network],
    enabled: enabled && !!taprootAddress && !!stakingId && !!network && isConnected,
    staleTime: 15_000,
    queryFn: async ({ signal }): Promise<{ positions: StakingPosition[] }> => {
      if (!taprootAddress || !stakingId) return { positions: [] };

      // Step 1: Find all alkane tokens at user's taproot address
      const tokens = await queryAlkanesAtAddress(network, taprootAddress, signal);

      // Step 2: Filter for position token candidates (block=2, amount=1 — NFT receipts)
      const candidates = tokens.filter(
        (t) => t.block === ALKANE_FACTORY_BLOCK && t.amount === 1n,
      );
      if (candidates.length === 0) return { positions: [] };

      // Step 3: Batch-check registration + details for all candidates in parallel
      const [stakingBlock, stakingTx] = stakingId.split(':');

      const results = await Promise.all(
        candidates.map(async (cand): Promise<StakingPosition | null> => {
          try {
            // IsRegisteredChild (opcode 36) on the staking contract
            const reg = await simulateCall(
              network, stakingBlock, stakingTx,
              ['36', String(cand.block), String(cand.tx)],
              signal,
            );
            if (reg.error || reg.data.length < 32) return null;
            if (parseU128FromHex(reg.data, 0) !== 1n) return null;

            // GetAllDetails (opcode 23) on the position token itself
            const details = await simulateCall(
              network, String(cand.block), String(cand.tx),
              ['23'], signal,
            );
            if (details.error || details.data.length < 288) return null;

            const d = details.data;
            return {
              tokenId: `${cand.block}:${cand.tx}`,
              positionId: Number(parseU128FromHex(d, 0)),
              depositAmount: parseU128FromHex(d, 16).toString(),
              weightedAmount: parseU128FromHex(d, 32).toString(),
              lockEnd: Number(parseU128FromHex(d, 48)),
              lockDuration: Number(parseU128FromHex(d, 64)),
              multiplier: Number(parseU128FromHex(d, 80)),
              rewardCheckpoint: parseU128FromHex(d, 96).toString(),
              depositTokenBlock: Number(parseU128FromHex(d, 112)),
              depositTokenTx: Number(parseU128FromHex(d, 128)),
            };
          } catch {
            return null;
          }
        }),
      );

      return { positions: results.filter((p): p is StakingPosition => p !== null) };
    },
    retry: 2,
  });
}
