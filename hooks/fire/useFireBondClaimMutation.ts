/**
 * FIRE Protocol Bond Claim Mutation Hook
 *
 * Claims vested FIRE from a bond in the bonding contract [4:259].
 * Simple cellpack with bond_id argument.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_BONDING_OPCODES } from '@/constants';

interface BondClaimParams {
  bondId: number;
  feeRate: number;
}

export function useFireBondClaimMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const bondingId = (config as any).FIRE_BONDING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ bondId, feeRate }: BondClaimParams) => {
      if (!provider || !isInitialized || !bondingId) {
        throw new Error('Provider or FIRE bonding contract not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [bondingBlock, bondingTx] = bondingId.split(':').map(Number);
      const protostonesStr = `[${bondingBlock},${bondingTx},${FIRE_BONDING_OPCODES.ClaimVested},${bondId}]:v0:v0`;

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

      if (!result?.psbt) throw new Error('Failed to build bond claim PSBT');

      // Phase 1: return PSBT for now — full signing flow will be added later
      return { psbt: result.psbt, txid: result?.txid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireUserBonds'] });
      queryClient.invalidateQueries({ queryKey: ['fireTokenStats'] });
    },
  });
}
