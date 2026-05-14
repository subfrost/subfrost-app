/**
 * useTokenToBtcSwap - CPFP packaged Token -> frBTC -> BTC flow.
 *
 * Tx A is signed by the user and swaps the sold token into frBTC at an
 * ephemeral taproot output. Tx B is signed by that ephemeral key, calls frBTC
 * unwrap, and records the user's wallet address as the BTC receiver.
 */
'use client';

import BigNumber from 'bignumber.js';
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useEphemeralWrapPackage } from '@/hooks/useEphemeralWrapPackage';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { useGlobalStore } from '@/stores/global';
import { getConfig } from '@/utils/getConfig';
import { getFutureBlockHeight } from '@/utils/amm';
import { FRBTC_UNWRAP_FEE_PER_1000 } from '@/constants/alkanes';
import type { OperationType } from '@/app/components/SwapSuccessNotification';

export interface TokenToBtcSwapProgress {
  type:
    | 'swapping'
    | 'swap-confirming'
    | 'unwrapping'
    | 'unwrap-confirming'
    | 'unwrap-indexing'
    | 'complete'
    | 'error';
  txId?: string;
  attempt?: number;
  maxAttempts?: number;
  swapTxId?: string;
  unwrapTxId?: string;
  step?: 'swap' | 'unwrap';
  message?: string;
}

export interface TokenToBtcSwapParams {
  /** Sell token alkane id (e.g. "2:0" for DIESEL). */
  fromTokenId: string;
  /** Sell amount in raw sub-units (1e8). */
  sellAmount: string;
  /** Quote-derived minimum BTC amount after slippage and unwrap fee. */
  minimumReceived: string;
  /** Pool id from the swap quote. */
  poolId?: { block: string | number; tx: string | number };
  feeRate: number;
  /** UI callback fired on every state transition. */
  onProgress: (progress: TokenToBtcSwapProgress) => void;
  /** UI callback fired when a tx is broadcast (for toast notifications). */
  onNotify: (txId: string, operation: OperationType, stepContext?: string) => void;
}

function grossUpForUnwrapFee(amount: string, unwrapFeePerThousand: number): string {
  const feeDenominator = 1000 - unwrapFeePerThousand;
  if (!Number.isFinite(feeDenominator) || feeDenominator <= 0) {
    throw new Error(`Invalid frBTC unwrap fee: ${unwrapFeePerThousand}`);
  }
  return new BigNumber(amount || '0')
    .multipliedBy(1000)
    .dividedBy(feeDenominator)
    .integerValue(BigNumber.ROUND_CEIL)
    .toString();
}

export function useTokenToBtcSwap() {
  const { network, address, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const executeEphemeralPackage = useEphemeralWrapPackage();
  const { deadlineBlocks } = useGlobalStore();
  const { data: premiumData } = useFrbtcPremium();

  const executeTokenToBtcSwap = useCallback(
    async (params: TokenToBtcSwapParams): Promise<{ swapTxId: string; unwrapTxId: string }> => {
      if (!address) throw new Error('No wallet address');
      if (!txContext) throw new Error('No wallet transaction context');
      if (!provider) throw new Error('Provider not available');
      if (!params.poolId) throw new Error('Token -> BTC swap requires a pool id');

      params.onProgress({ type: 'swapping' });

      const config = getConfig(network);
      const { getSignerAddressDynamic } = await import('@/lib/alkanes/helpers');
      const { buildSwapProtostone, buildUnwrapProtostones } = await import('@/lib/alkanes/builders');

      const unwrapFee = premiumData?.unwrapFeePerThousand ?? FRBTC_UNWRAP_FEE_PER_1000;
      const minimumFrbtcAmount = grossUpForUnwrapFee(params.minimumReceived || '1', unwrapFee);
      const deadlineProvider = provider as Parameters<typeof getFutureBlockHeight>[1];
      const deadline = (await getFutureBlockHeight(deadlineBlocks || 5, deadlineProvider)).toString();
      const signerAddress = await getSignerAddressDynamic(network);
      const payerAddress = txContext.btcChangeAddress;
      const alkaneRefundAddress = txContext.alkanesChangeAddress;
      const [frbtcBlock, frbtcTx] = config.FRBTC_ALKANE_ID.split(':').map(Number);

      const parentProtostone = buildSwapProtostone({
        factoryId: config.ALKANE_FACTORY_ID,
        sellTokenId: params.fromTokenId,
        buyTokenId: config.FRBTC_ALKANE_ID,
        sellAmount: params.sellAmount,
        minOutput: minimumFrbtcAmount,
        deadline,
        pointer: 'v0',
        refund: 'v0',
      });

      const childProtostone = buildUnwrapProtostones({
        frbtcId: config.FRBTC_ALKANE_ID,
        dustVout: 2,
        amount: minimumFrbtcAmount,
        pointer: 'v1',
        refund: 'v0',
      });

      try {
        const result = await executeEphemeralPackage({
          feeRate: params.feeRate,
          signerAddress,
          userAddress: payerAddress,
          parentInputRequirements: `${params.fromTokenId}:${params.sellAmount}`,
          parentProtostone,
          parentExtraToAddresses: [],
          childInputRequirements: `${config.FRBTC_ALKANE_ID}:${minimumFrbtcAmount}`,
          childProtostone,
          childAlkanes: [{
            block: frbtcBlock,
            tx: frbtcTx,
            amount: minimumFrbtcAmount,
          }],
          // v0 is the taproot alkane refund/change output; v1 is the BTC
          // recipient the unwrap call reads via pointer=v1.
          childToAddresses: [alkaneRefundAddress, payerAddress, signerAddress],
          childAlkanesChangeAddress: alkaneRefundAddress,
          invalidate: 'swap',
        });

        const swapTxId = result.wrapTxId || result.transactionId;
        const unwrapTxId = result.transactionId;
        params.onNotify(unwrapTxId, 'swap');
        params.onProgress({ type: 'complete', swapTxId, unwrapTxId });
        return { swapTxId, unwrapTxId };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        params.onProgress({ type: 'error', step: 'swap', message });
        throw error;
      }
    },
    [address, deadlineBlocks, executeEphemeralPackage, network, premiumData, provider, txContext],
  );

  const mutation = useMutation({ mutationFn: executeTokenToBtcSwap });

  return {
    executeTokenToBtcSwap: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
