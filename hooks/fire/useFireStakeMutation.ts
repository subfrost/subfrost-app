/**
 * FIRE Protocol Staking Mutation Hook
 *
 * Stakes LP tokens into the FIRE staking contract [4:257] with a lock duration.
 * Uses two-protostone pattern: p0 edict transfers LP tokens to p1 cellpack.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 * See CLAUDE.md "Browser Wallet Output Address Bug" for details.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_STAKING_OPCODES } from '@/constants';
import { LOCK_TIERS } from '@/utils/fireCalculations';

interface StakeParams {
  lpAmount: string; // LP token amount in base units
  lockTierIndex: number; // Index into LOCK_TIERS
  feeRate: number;
}

export function useFireStakeMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ lpAmount, lockTierIndex, feeRate }: StakeParams) => {
      if (!provider || !isInitialized || !stakingId) {
        throw new Error('Provider or FIRE staking contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const tier = LOCK_TIERS[lockTierIndex];
      if (!tier) throw new Error('Invalid lock tier');

      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);

      // Build protostones string: cellpack calls staking opcode 1 with lock_duration
      const protostonesStr = `[${stakingBlock},${stakingTx},${FIRE_STAKING_OPCODES.Stake},${tier.duration}]:v0:v0`;

      // inputRequirements: SDK auto-generates edict from this
      // TODO: Replace with actual LP token ID from pool discovery
      const lpTokenId = '2:6'; // regtest DIESEL/frBTC LP token
      const inputReqStr = `A:${lpTokenId}:${lpAmount}`;

      const toAddresses = isBrowserWallet ? [taprootAddress] : ['p2tr:0'];
      const changeAddr = isBrowserWallet ? (segwitAddress || taprootAddress) : 'p2wpkh:0';
      const alkanesChangeAddr = isBrowserWallet ? taprootAddress : 'p2tr:0';

      const result = await (provider as any).alkanesExecuteTyped({
        inputRequirements: inputReqStr,
        protostones: protostonesStr,
        feeRate,
        autoConfirm: false,
        toAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
        ordinalsStrategy: 'burn',
      });

      if (!result?.psbt) throw new Error('Failed to build stake PSBT');

      // Phase 1: return PSBT for now — full signing flow will be added later
      return { psbt: result.psbt, txid: result?.txid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireStakingStats'] });
      queryClient.invalidateQueries({ queryKey: ['fireUserPositions'] });
    },
  });
}
