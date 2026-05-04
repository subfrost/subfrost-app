import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { fetchUserAlkaneBalances } from '@/queries/account';
import { simulateContract, extractField3Data, parseU128LE } from '@/lib/fujin/rpc';

export interface StakingPosition {
  positionId: number;
  tokenId: string; // alkane ID of the position NFT (e.g. "2:8")
  depositAmount: string;
  weightedAmount: string;
  lockEnd: string;
  lockDuration: string;
  multiplier: number;
  rewardCheckpoint: string;
  pendingRewards: string;
}

const LOCAL_NETWORKS = ['regtest-local', 'devnet'];

/**
 * Discover position NFT tokens in the user's wallet and fetch their details.
 *
 * Flow:
 * 1. Discover all alkane balances at the taproot address via the canonical
 *    UTXO+outpoint fanout (`fetchUserAlkaneBalances` — esplora_address::utxo
 *    → Promise.all(protorunesbyoutpoint) per dust UTXO). Never use
 *    `protorunesbyaddress` directly: that view carries phantom balances on
 *    previously-spent outpoints and shows tokens the wallet no longer holds.
 * 2. For each token, call staking contract IsRegisteredChild (opcode 36)
 * 3. For confirmed position tokens, call GetAllDetails (opcode 23) on the token itself
 */
export function useFireUserPositions(enabled: boolean = true) {
  const { network, isConnected, account } = useWallet();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireUserPositions', stakingId, account?.taproot?.address, network],
    enabled: enabled && !!stakingId && !!network && isConnected && !!account?.taproot?.address,
    queryFn: async (): Promise<{ positions: StakingPosition[]; pendingRewards: string }> => {
      if (!stakingId || !network || !account?.taproot?.address) {
        return { positions: [], pendingRewards: '0' };
      }

      const rpcUrl = LOCAL_NETWORKS.includes(network) ? 'http://localhost:18888' : getRpcUrl(network);
      const taprootAddress = account.taproot.address;

      // 1. Get all tokens at taproot address via canonical UTXO+outpoint
      // fanout (avoids `protorunesbyaddress` phantom-balance bug).
      const balanceMap = await fetchUserAlkaneBalances(network, taprootAddress);

      // 2. Check each token against staking contract IsRegisteredChild (opcode 36)
      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);
      const candidateIds: string[] = [];

      for (const tokenId of balanceMap.keys()) {
        const [block, tx] = tokenId.split(':').map(Number);
        // Quick filter: position tokens are minted by the staking factory, block=2
        // Skip known non-position tokens
        if (tokenId === '2:0' || tokenId === '32:0') continue;
        // Also skip the LP token itself
        const lpTokenId = (config as any).FIRE_LP_TOKEN_ID || '2:3';
        if (tokenId === lpTokenId) continue;

        try {
          const result = await simulateContract(rpcUrl, stakingId, 36, [block, tx]);
          const data = extractField3Data(result, 1);
          if (data) {
            const isChild = Number(parseU128LE(data, 0));
            if (isChild === 1) {
              candidateIds.push(tokenId);
            }
          }
        } catch {
          // Not a child — skip
        }
      }

      console.log('[useFireUserPositions] Found position tokens:', candidateIds);

      // 3. For each position token, call GetAllDetails (opcode 23)
      // Response: 144 bytes packed (9 x u128 LE)
      const positions: StakingPosition[] = [];
      let totalPending = 0n;

      for (const tokenId of candidateIds) {
        try {
          const result = await simulateContract(rpcUrl, tokenId, 23);
          const data = extractField3Data(result, 128);
          if (!data || data.length < 288) { // 144 bytes = 288 hex chars
            console.warn('[useFireUserPositions] GetAllDetails too short for', tokenId, data?.length);
            continue;
          }

          const positionId = Number(parseU128LE(data, 0));
          const depositAmount = parseU128LE(data, 32).toString();
          const weightedAmount = parseU128LE(data, 64).toString();
          const lockEnd = parseU128LE(data, 96).toString();
          const lockDuration = parseU128LE(data, 128).toString();
          const multiplier = Number(parseU128LE(data, 160)); // basis points
          const rewardCheckpoint = parseU128LE(data, 192).toString();
          const pendingRewards = parseU128LE(data, 224).toString();

          totalPending += BigInt(pendingRewards);

          positions.push({
            positionId,
            tokenId,
            depositAmount,
            weightedAmount,
            lockEnd,
            lockDuration,
            multiplier: multiplier / 100, // bps → multiplier (e.g. 100 → 1.0x)
            rewardCheckpoint,
            pendingRewards,
          });

          console.log('[useFireUserPositions] Position', tokenId, ':', {
            positionId,
            deposit: (Number(depositAmount) / 1e8).toFixed(4),
            weighted: (Number(weightedAmount) / 1e8).toFixed(4),
            multiplier: multiplier / 100,
            pending: (Number(pendingRewards) / 1e8).toFixed(8),
          });
        } catch (e) {
          console.warn('[useFireUserPositions] GetAllDetails failed for', tokenId, e);
        }
      }

      return {
        positions,
        pendingRewards: totalPending.toString(),
      };
    },
    retry: 2,
    staleTime: 15_000,
  });
}
