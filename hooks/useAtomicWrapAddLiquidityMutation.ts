/**
 * useAtomicWrapAddLiquidityMutation — single-tx BTC + Token X → LP.
 *
 * Wraps `useAddLiquidityMutation` with the protostone construction needed
 * for an atomic wrap+addLiquidity OR atomic wrap+createPool. Two chained
 * protostones:
 *   p0: [32,0,FRBTC_WRAP_OPCODE]:p1:v1
 *       — wraps BTC, forwards (auto-allocated X + minted frBTC) to p1
 *   p1: factory.AddLiquidity (opcode 11) for existing pool, OR
 *       factory.CreateNewPool (opcode 1) when no frBTC/X pool exists yet.
 *
 * The frBTC contract uses CallResponse::forward(incoming_alkanes), so the
 * user's Token X auto-allocated to p0 passes through alongside the minted
 * frBTC and lands at p1 as incomingAlkanes.
 *
 * Output layout:
 *   v0 = signer (receives BTC)
 *   v1 = user (LP tokens + token refunds)
 */
'use client';

import BigNumber from 'bignumber.js';
import { useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAddLiquidityMutation, findPoolId } from '@/hooks/useAddLiquidityMutation';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { useFeeRate } from '@/hooks/useFeeRate';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { getConfig } from '@/utils/getConfig';

export interface AtomicWrapAddLiquidityParams {
  /** The non-BTC token in the LP pair (the partner of frBTC). */
  tokenSideId: string;
  /** Display BTC amount (e.g. "0.01"). */
  btcAmount: string;
  /** Display token X amount (e.g. "100"). */
  tokenAmount: string;
  /** Slippage percent (e.g. "0.5"). */
  maxSlippage: string;
  /** Deadline blocks from "now". */
  deadlineBlocks: number;
  /** Optional pool id; mutation falls back to factory.FindPoolId if absent. */
  poolId?: { block: number; tx: number };
}

export function useAtomicWrapAddLiquidityMutation() {
  const { network, address } = useWallet();
  const provider = useSandshrewProvider();
  const addLiquidityMutation = useAddLiquidityMutation();
  const { data: premiumData } = useFrbtcPremium();
  const fee = useFeeRate();

  const executeAtomicAddLiquidity = useCallback(
    async (params: AtomicWrapAddLiquidityParams) => {
      const config = getConfig(network);
      if (!address) throw new Error('No wallet address');
      if (!config.FRBTC_ALKANE_ID) throw new Error('frBTC alkane id not configured');
      if (params.tokenSideId === 'btc' || params.tokenSideId === config.FRBTC_ALKANE_ID) {
        throw new Error('Atomic wrap+addLiquidity requires a non-BTC partner token');
      }

      const { getSignerAddressDynamic } = await import('@/lib/alkanes/helpers');
      const {
        buildAtomicWrapAddLiquidityProtostones,
        buildAtomicWrapCreatePoolProtostones,
      } = await import('@/lib/alkanes/builders');

      // Convert BTC → sats; apply wrap fee to compute frBTC actually arriving at the factory call.
      const btcSats = new BigNumber(params.btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
      const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
      const frbtcDesired = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR);
      const tokenAmountAlks = new BigNumber(params.tokenAmount).multipliedBy(1e8)
        .integerValue(BigNumber.ROUND_FLOOR);

      // Resolve pool existence: caller-supplied poolId trumps factory lookup.
      // null → no pool exists → CreateNewPool path; otherwise → AddLiquidity.
      let resolvedPoolId = params.poolId ?? null;
      if (!resolvedPoolId && provider) {
        resolvedPoolId = await findPoolId(
          provider,
          config.ALKANE_FACTORY_ID,
          config.FRBTC_ALKANE_ID,
          params.tokenSideId,
        );
      }

      let protostones: string;
      if (resolvedPoolId) {
        // Pool exists — opcode 11 with full Uniswap-style slippage + deadline.
        const slippageFactor = new BigNumber(100).minus(params.maxSlippage).dividedBy(100);
        const frbtcMin = frbtcDesired.multipliedBy(slippageFactor).integerValue(BigNumber.ROUND_FLOOR);
        const tokenMin = tokenAmountAlks.multipliedBy(slippageFactor).integerValue(BigNumber.ROUND_FLOOR);
        const currentBlock = parseInt(localStorage.getItem('subfrost_last_block_height') || '0', 10);
        const deadline = (currentBlock + (params.deadlineBlocks || 5)).toString();

        protostones = buildAtomicWrapAddLiquidityProtostones({
          factoryId: config.ALKANE_FACTORY_ID,
          tokenA: config.FRBTC_ALKANE_ID,
          tokenB: params.tokenSideId,
          amountADesired: frbtcDesired.toString(),
          amountBDesired: tokenAmountAlks.toString(),
          amountAMin: frbtcMin.toString(),
          amountBMin: tokenMin.toString(),
          deadline,
        });
      } else {
        // Pool doesn't exist — opcode 1 (CreateNewPool). User's amounts set the
        // initial price; no min-amounts / deadline (nothing to slip against).
        protostones = buildAtomicWrapCreatePoolProtostones({
          factoryId: config.ALKANE_FACTORY_ID,
          tokenA: config.FRBTC_ALKANE_ID,
          tokenB: params.tokenSideId,
          amountA: frbtcDesired.toString(),
          amountB: tokenAmountAlks.toString(),
        });
      }

      const inputRequirements = `B:${btcSats.toString()}:v0,${params.tokenSideId}:${tokenAmountAlks.toString()}`;
      const signerAddress = await getSignerAddressDynamic(network);

      return addLiquidityMutation.mutateAsync({
        token0Id: config.FRBTC_ALKANE_ID,
        token1Id: params.tokenSideId,
        token0Amount: new BigNumber(frbtcDesired).dividedBy(1e8).toString(),
        token1Amount: params.tokenAmount,
        token0Decimals: 8,
        token1Decimals: 8,
        maxSlippage: params.maxSlippage,
        feeRate: fee.feeRate,
        deadlineBlocks: params.deadlineBlocks,
        poolId: resolvedPoolId ?? undefined,
        overrideProtostones: protostones,
        overrideToAddresses: [signerAddress, address],
        overrideInputRequirements: inputRequirements,
      });
    },
    [network, address, premiumData, fee.feeRate, addLiquidityMutation, provider],
  );

  return {
    executeAtomicAddLiquidity,
    isPending: addLiquidityMutation.isPending,
    error: addLiquidityMutation.error,
  };
}
