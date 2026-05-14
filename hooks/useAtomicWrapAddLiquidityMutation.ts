/**
 * useAtomicWrapAddLiquidityMutation — single-tx BTC + Token X → LP.
 *
 * Wraps `useAddLiquidityMutation` with the protostone construction needed
 * for an atomic wrap+addLiquidity OR atomic wrap+createPool. Two chained
 * protostones:
 *   p0: [32,0,FRBTC_WRAP_OPCODE]:v0:v0
 *       — wraps BTC and refunds minted frBTC + auto-allocated X to ephemeral v0
 *   Tx B: ephemeral signs factory.AddLiquidity (opcode 11) for existing pool,
 *       OR factory.CreateNewPool (opcode 1) when no frBTC/X pool exists yet.
 *
 * The child transaction spends ephemeral v0 and finalizes the LP outputs back
 * to the user's address.
 *
 * Output layout:
 *   parent v0 = ephemeral refund/carrier, parent v1 = signer wrap address
 *   child v0 = user (LP tokens + token refunds)
 */
'use client';

import BigNumber from 'bignumber.js';
import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { findPoolId } from '@/hooks/useAddLiquidityMutation';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { useEphemeralWrapPackage } from '@/hooks/useEphemeralWrapPackage';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { getConfig } from '@/utils/getConfig';
import { getFutureBlockHeight } from '@/utils/amm';
import { FRBTC_WRAP_OPCODE } from '@/lib/alkanes/constants';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';

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
  feeRate: number; // sats/vB — pass caller's useFeeRate instance (each hook instance has independent state)
  /** Optional pool id; mutation falls back to factory.FindPoolId if absent. */
  poolId?: { block: number; tx: number };
  /**
   * Opt-in CPFP-chained 2-tx flow. Same fuel-budget rationale as
   * useAtomicWrapSwapMutation: combined wrap + addLiquidity exceeds the
   * per-tx 3.5M MINIMUM_FUEL floor when block_fuel is depleted, causing
   * OOG. Splitting moves the wrap into its own parent tx so each gets a
   * fresh budget. Default: on for mainnet.
   */
  splitTransactions?: boolean;
}

export function useAtomicWrapAddLiquidityMutation() {
  const { network, address, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const executeEphemeralWrapPackage = useEphemeralWrapPackage();
  const { data: premiumData } = useFrbtcPremium();

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
        buildFactoryAddLiquidityProtostones,
        buildFactoryCreatePoolProtostone,
      } = await import('@/lib/alkanes/builders');

      // Convert BTC → sats; apply wrap fee to compute frBTC actually arriving at the factory call.
      const btcSats = new BigNumber(params.btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
      const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
      const frbtcDesired = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR);
      const tokenAmountAlks = new BigNumber(params.tokenAmount).multipliedBy(1e8)
        .integerValue(BigNumber.ROUND_FLOOR);

      // On devnet, useEphemeralWrapPackage uses forcePsbt=true which bypasses
      // alkanesExecuteFull auto-mine — the parent wrap is never confirmed so
      // the child tx can't reference it. Use two sequential alkanesExecuteFull
      // calls instead: wrap BTC→frBTC, then CreateNewPool or AddLiquidity.
      if (network === 'devnet' && provider && txContext) {
        const signerAddress = await getSignerAddressDynamic(network);
        const btcSats = new BigNumber(params.btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
        const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
        const frbtcAfterFee = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
          .integerValue(BigNumber.ROUND_FLOOR);
        const tokenAmountAlks = new BigNumber(params.tokenAmount).multipliedBy(1e8)
          .integerValue(BigNumber.ROUND_FLOOR);

        // Step 1: Wrap BTC → frBTC
        await alkanesExecuteTyped(provider as any, {
          network,
          txContext,
          toAddresses: [signerAddress, address],
          inputRequirements: `B:${btcSats.toString()}:v0`,
          protostones: `[32,0,${FRBTC_WRAP_OPCODE}]:v1:v1`,
          feeRate: params.feeRate,
          autoConfirm: true,
        });

        // Step 2: CreateNewPool or AddLiquidity
        let resolvedPoolId = params.poolId ?? null;
        if (!resolvedPoolId && provider) {
          resolvedPoolId = await findPoolId(
            provider,
            config.ALKANE_FACTORY_ID,
            config.FRBTC_ALKANE_ID,
            params.tokenSideId,
          );
        }

        let protostone: string;
        if (resolvedPoolId) {
          const slippageFactor = new BigNumber(100).minus(params.maxSlippage).dividedBy(100);
          const frbtcMin = frbtcAfterFee.multipliedBy(slippageFactor).integerValue(BigNumber.ROUND_FLOOR);
          const tokenMin = tokenAmountAlks.multipliedBy(slippageFactor).integerValue(BigNumber.ROUND_FLOOR);
          const deadline = (await getFutureBlockHeight(params.deadlineBlocks || 5, provider as any)).toString();
          protostone = buildFactoryAddLiquidityProtostones({
            factoryId: config.ALKANE_FACTORY_ID,
            tokenA: config.FRBTC_ALKANE_ID,
            tokenB: params.tokenSideId,
            amountADesired: frbtcAfterFee.toString(),
            amountBDesired: tokenAmountAlks.toString(),
            amountAMin: frbtcMin.toString(),
            amountBMin: tokenMin.toString(),
            deadline,
          });
        } else {
          protostone = buildFactoryCreatePoolProtostone({
            factoryId: config.ALKANE_FACTORY_ID,
            tokenA: config.FRBTC_ALKANE_ID,
            tokenB: params.tokenSideId,
            amountA: frbtcAfterFee.toString(),
            amountB: tokenAmountAlks.toString(),
          });
        }

        const result = await alkanesExecuteTyped(provider as any, {
          network,
          txContext,
          toAddresses: [address],
          inputRequirements: `${config.FRBTC_ALKANE_ID}:${frbtcAfterFee.toString()},${params.tokenSideId}:${tokenAmountAlks.toString()}`,
          protostones: protostone,
          feeRate: params.feeRate,
          autoConfirm: true,
        });
        const txid = result?.txid || result?.reveal_txid || result?.revealTxid || result?.transaction_id || '';
        return { success: true, transactionId: txid };
      }

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
        // Block height via the WASM provider — the localStorage path was
        // unreliable (stale "NaN" propagating into the cellpack as
        // "Invalid edict format"). Same pattern as
        // useRemoveLiquidityMutation / useSwapMutation.
        const deadline = (await getFutureBlockHeight(params.deadlineBlocks || 5, provider as any)).toString();

        protostones = buildFactoryAddLiquidityProtostones({
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
        protostones = buildFactoryCreatePoolProtostone({
          factoryId: config.ALKANE_FACTORY_ID,
          tokenA: config.FRBTC_ALKANE_ID,
          tokenB: params.tokenSideId,
          amountA: frbtcDesired.toString(),
          amountB: tokenAmountAlks.toString(),
        });
      }

      const signerAddress = await getSignerAddressDynamic(network);

      return executeEphemeralWrapPackage({
        feeRate: params.feeRate,
        signerAddress,
        userAddress: address,
        parentInputRequirements: `B:${btcSats.toString()}:v1,${params.tokenSideId}:${tokenAmountAlks.toString()}`,
        parentProtostone: `[32,0,${FRBTC_WRAP_OPCODE}]:v0:v0`,
        childInputRequirements: `${config.FRBTC_ALKANE_ID}:${frbtcDesired.toString()},${params.tokenSideId}:${tokenAmountAlks.toString()}`,
        childProtostone: protostones,
        childAlkanes: [
          { block: 32, tx: 0, amount: frbtcDesired.toString() },
          {
            block: Number(params.tokenSideId.split(':')[0]),
            tx: Number(params.tokenSideId.split(':')[1]),
            amount: tokenAmountAlks.toString(),
          },
        ],
        invalidate: 'addLiquidity',
        splitTransactions: params.splitTransactions ?? (network === 'mainnet'),
      });
    },
    [network, address, txContext, premiumData, executeEphemeralWrapPackage, provider],
  );
  const mutation = useMutation({ mutationFn: executeAtomicAddLiquidity });

  return {
    executeAtomicAddLiquidity: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
