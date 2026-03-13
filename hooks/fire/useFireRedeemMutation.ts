/**
 * FIRE Protocol Redeem Mutation Hook
 *
 * Burns FIRE tokens to redeem backing LP from the redemption contract [4:260].
 * Uses two-protostone pattern: p0 edict transfers FIRE tokens to p1 cellpack.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { FIRE_REDEMPTION_OPCODES } from '@/constants';

interface RedeemParams {
  fireAmount: string; // FIRE token amount in base units
  feeRate: number;
}

export function useFireRedeemMutation() {
  const queryClient = useQueryClient();
  const { network, walletType, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const redemptionId = (config as any).FIRE_REDEMPTION_ID as string | undefined;
  const fireTokenId = (config as any).FIRE_TOKEN_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ fireAmount, feeRate }: RedeemParams) => {
      if (!provider || !isInitialized || !redemptionId || !fireTokenId) {
        throw new Error('Provider or FIRE contracts not ready');
      }

      const isBrowserWallet = walletType === 'browser';
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!taprootAddress) throw new Error('Taproot address required');

      const [redemptionBlock, redemptionTx] = redemptionId.split(':').map(Number);
      const protostonesStr = `[${redemptionBlock},${redemptionTx},${FIRE_REDEMPTION_OPCODES.Redeem}]:v0:v0`;

      // FIRE token input via inputRequirements
      const inputReqStr = `A:${fireTokenId}:${fireAmount}`;

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

      if (!result?.psbt) throw new Error('Failed to build redeem PSBT');

      // Phase 1: return PSBT for now — full signing flow will be added later
      return { psbt: result.psbt, txid: result?.txid };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireRedemption'] });
      queryClient.invalidateQueries({ queryKey: ['fireTokenStats'] });
    },
  });
}
