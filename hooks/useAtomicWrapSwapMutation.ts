/**
 * useAtomicWrapSwapMutation — single-tx BTC → Token swap.
 *
 * Wraps `useSwapMutation` with the protostone construction needed for an
 * atomic wrap+swap. Two chained protostones in one Bitcoin tx:
 *   p0: [32,0,FRBTC_WRAP_OPCODE]:p1:v1   — wrap BTC → frBTC
 *   p1: factory.SwapExactTokensForTokens — swap frBTC for buyToken
 *
 * Output layout:
 *   v0 = signer (receives BTC)
 *   v1 = user (receives buyToken)
 *
 * Verified in alkanes-rs/crates/alkanes-integ-tests/tests/atomic_wrap_swap.rs.
 *
 * Why this hook exists separately from useSwapMutation:
 *   The atomic flow needs runtime data (signer address, wrap fee, current
 *   block height) and dynamic imports (helpers, builders). Inlining all of
 *   that in SwapShell coupled the UI to the on-chain protocol shape, so a
 *   UI refactor would silently drop the atomic path. Living in a hook keeps
 *   the protostone construction outside the rendered tree.
 */
'use client';

import BigNumber from 'bignumber.js';
import { useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useSwapMutation } from '@/hooks/useSwapMutation';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { useFeeRate } from '@/hooks/useFeeRate';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { getConfig } from '@/utils/getConfig';

export interface AtomicWrapSwapParams {
  /** Display BTC amount (e.g. "0.001"). */
  btcAmount: string;
  /** Buy token alkane id (e.g. "2:0" for DIESEL). */
  buyTokenId: string;
  /** Pool id from the swap quote. */
  poolId?: { block: string | number; tx: string | number };
  /** Quote's expected buy amount in sub-units. Used by mutation for display. */
  quoteBuyAmount: string;
  /** Quote's minimum-received in sub-units (post-slippage). */
  minimumReceived: string;
  /** Slippage percent (e.g. "0.5"). */
  maxSlippage: string;
  /** Deadline blocks from "now". */
  deadlineBlocks: number;
}

export function useAtomicWrapSwapMutation() {
  const { network, address } = useWallet();
  const swapMutation = useSwapMutation();
  const { data: premiumData } = useFrbtcPremium();
  const fee = useFeeRate();

  const executeAtomicSwap = useCallback(
    async (params: AtomicWrapSwapParams) => {
      const config = getConfig(network);
      if (!address) throw new Error('No wallet address');

      const { getSignerAddressDynamic } = await import('@/lib/alkanes/helpers');
      const { buildAtomicWrapSwapProtostones } = await import('@/lib/alkanes/builders');

      const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
      const btcSats = new BigNumber(params.btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
      const frbtcAfterFee = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR).toString();

      const currentBlock = parseInt(localStorage.getItem('subfrost_last_block_height') || '0', 10);
      const deadline = (currentBlock + params.deadlineBlocks).toString();

      const protostones = buildAtomicWrapSwapProtostones({
        factoryId: config.ALKANE_FACTORY_ID,
        buyTokenId: params.buyTokenId,
        sellAmount: frbtcAfterFee,
        minOutput: params.minimumReceived || '1',
        deadline,
      });

      const signerAddress = await getSignerAddressDynamic(network);

      return swapMutation.mutateAsync({
        sellCurrency: 'btc',
        buyCurrency: params.buyTokenId,
        direction: 'sell',
        sellAmount: btcSats.toString(),
        buyAmount: params.quoteBuyAmount,
        maxSlippage: params.maxSlippage,
        feeRate: fee.feeRate,
        poolId: params.poolId,
        deadlineBlocks: params.deadlineBlocks,
        // Override protostones and addresses for atomic wrap+swap.
        // v0 = signer (BTC), v1 = user (swap output).
        overrideProtostones: protostones,
        overrideToAddresses: [signerAddress, address],
        overrideInputRequirements: `B:${btcSats.toString()}:v0`,
      } as any);
    },
    [network, address, premiumData, fee.feeRate, swapMutation],
  );

  return {
    executeAtomicSwap,
    isPending: swapMutation.isPending,
    error: swapMutation.error,
  };
}
