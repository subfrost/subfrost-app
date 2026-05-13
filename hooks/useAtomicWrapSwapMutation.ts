/**
 * useAtomicWrapSwapMutation — BTC → Token swap.
 *
 * Wraps `useSwapMutation` with the protostone construction needed for an
 * wrap+swap. Two chained protostones split into a CPFP package:
 *   p0: [32,0,FRBTC_WRAP_OPCODE]:v0:v0   — wrap BTC → frBTC
 *   p1: factory.SwapExactTokensForTokens — swap frBTC for buyToken
 *
 * Output layout:
 *   parent v0 = ephemeral refund/carrier, parent v1 = signer wrap address
 *   child v0 = user (receives buyToken)
 *
 * The Rust executor rewrites this into Tx A (wrap-only) and Tx B (swap-only)
 * when splitTransactions=true.
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
import { useMutation } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { useEphemeralWrapPackage } from '@/hooks/useEphemeralWrapPackage';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { getConfig } from '@/utils/getConfig';
import { getFutureBlockHeight } from '@/utils/amm';
import { FRBTC_WRAP_OPCODE } from '@/lib/alkanes/constants';

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
  feeRate: number; // sats/vB — pass caller's useFeeRate instance (each hook instance has independent state)
  /**
   * Opt-in CPFP-chained 2-tx flow:
   *   Tx A: wrap-only — mints frBTC to a UTXO at the user's taproot.
   *   Tx B: factory swap — spends Tx A:1 (frBTC carrier) + Tx A:2 (BTC fee).
   *
   * Each tx gets its own per-tx fuel budget (3.5M MINIMUM_FUEL floor +
   * block_fuel share) instead of sharing one budget across both protostones.
   * Required when combined wrap + execute fuel cost (~5M) exceeds the floor
   * — typical on busy mainnet blocks where block_fuel is depleted.
   *
   * When false, uses the legacy single-tx atomic flow.
   */
  splitTransactions?: boolean;
}

export function useAtomicWrapSwapMutation() {
  const { network, address } = useWallet();
  const provider = useSandshrewProvider();
  const executeEphemeralWrapPackage = useEphemeralWrapPackage();
  const { data: premiumData } = useFrbtcPremium();

  const executeAtomicSwap = useCallback(
    async (params: AtomicWrapSwapParams) => {
      const config = getConfig(network);
      if (!address) throw new Error('No wallet address');

      const { getSignerAddressDynamic } = await import('@/lib/alkanes/helpers');
      const { buildSwapProtostone } = await import('@/lib/alkanes/builders');

      const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
      const btcSats = new BigNumber(params.btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
      const frbtcAfterFee = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR).toString();

      // Block height via the WASM provider — the localStorage path was
      // unreliable (stale "NaN" propagating into the cellpack as
      // "Invalid edict format"). Same pattern as
      // useRemoveLiquidityMutation / useSwapMutation.
      const deadline = (await getFutureBlockHeight(params.deadlineBlocks, provider as any)).toString();

      const childProtostone = buildSwapProtostone({
        factoryId: config.ALKANE_FACTORY_ID,
        sellTokenId: config.FRBTC_ALKANE_ID,
        buyTokenId: params.buyTokenId,
        sellAmount: frbtcAfterFee,
        minOutput: params.minimumReceived || '1',
        deadline,
      });

      const signerAddress = await getSignerAddressDynamic(network);

      return executeEphemeralWrapPackage({
        feeRate: params.feeRate,
        signerAddress,
        userAddress: address,
        parentInputRequirements: `B:${btcSats.toString()}:v1`,
        parentProtostone: `[32,0,${FRBTC_WRAP_OPCODE}]:v0:v0`,
        childInputRequirements: `${config.FRBTC_ALKANE_ID}:${frbtcAfterFee}`,
        childProtostone,
        childAlkanes: [{
          block: 32,
          tx: 0,
          amount: frbtcAfterFee,
        }],
        invalidate: 'swap',
      });
    },
    [network, address, premiumData, executeEphemeralWrapPackage, provider],
  );
  const mutation = useMutation({ mutationFn: executeAtomicSwap });

  return {
    executeAtomicSwap: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
