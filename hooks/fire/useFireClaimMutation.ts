/**
 * FIRE Protocol Claim Rewards Mutation Hook
 *
 * Claims pending FIRE rewards from the staking contract [4:257].
 * Simple cellpack, no token input needed.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_STAKING_OPCODES } from '@/constants';

interface ClaimParams {
  feeRate: number;
}

export function useFireClaimMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ feeRate }: ClaimParams) => {
      if (!provider || !isInitialized || !stakingId) {
        throw new Error('Provider or FIRE staking contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);
      const protostonesStr = `[${stakingBlock},${stakingTx},${FIRE_STAKING_OPCODES.ClaimRewards}]:v0:v0`;

      const toAddresses = isBrowserWallet ? [taprootAddress] : ['p2tr:0'];
      const changeAddr = isBrowserWallet ? (segwitAddress || taprootAddress) : 'p2wpkh:0';
      const alkanesChangeAddr = isBrowserWallet ? taprootAddress : 'p2tr:0';

      const result = await (provider as any).alkanesExecuteTyped({
        inputRequirements: '',
        protostones: protostonesStr,
        feeRate,
        autoConfirm: false,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
        ordinalsStrategy: 'burn',
      });

      if (!result?.psbt) throw new Error('Failed to build claim PSBT');

      // Phase 1: return PSBT for now — full signing flow will be added later
      return { psbt: result.psbt, txid: result?.txid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireUserPositions'] });
      queryClient.invalidateQueries({ queryKey: ['fireTokenStats'] });
    },
  });
}
