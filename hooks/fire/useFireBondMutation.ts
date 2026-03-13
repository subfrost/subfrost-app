/**
 * FIRE Protocol Bond Mutation Hook
 *
 * Bonds LP tokens to the FIRE bonding contract [4:259] for discounted FIRE.
 * Uses two-protostone pattern: p0 edict transfers LP to p1 cellpack.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_BONDING_OPCODES } from '@/constants';

interface BondParams {
  lpAmount: string; // LP token amount in base units
  feeRate: number;
}

export function useFireBondMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ lpAmount, feeRate }: BondParams) => {
      if (!provider || !isInitialized || !bondingId) {
        throw new Error('Provider or FIRE bonding contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [bondingBlock, bondingTx] = bondingId.split(':').map(Number);
      const protostonesStr = `[${bondingBlock},${bondingTx},${FIRE_BONDING_OPCODES.Bond}]:v0:v0`;

      // LP token input via inputRequirements
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

      if (!result?.psbt) throw new Error('Failed to build bond PSBT');

      // Phase 1: return PSBT for now — full signing flow will be added later
      return { psbt: result.psbt, txid: result?.txid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireBondingStats'] });
      queryClient.invalidateQueries({ queryKey: ['fireUserBonds'] });
    },
  });
}
