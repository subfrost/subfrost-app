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
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useFrbtcPremium } from '@/hooks/useFrbtcPremium';
import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { getConfig } from '@/utils/getConfig';
import { getFutureBlockHeight } from '@/utils/amm';

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
   * When false (default), uses the original single-tx atomic flow which
   * works fine when block_fuel is abundant but OOGs at the floor.
   */
  splitTransactions?: boolean;
}

export function useAtomicWrapSwapMutation() {
  const { network, address } = useWallet();
  const swapMutation = useSwapMutation();
  const provider = useSandshrewProvider();
  const { data: premiumData } = useFrbtcPremium();

  const executeAtomicSwap = useCallback(
    async (params: AtomicWrapSwapParams) => {
      const t0 = performance.now();
      const stamp = (label: string) =>
        console.log(`[atomicWrapSwap] +${(performance.now() - t0).toFixed(0)}ms ${label}`);

      stamp('start');
      const config = getConfig(network);
      if (!address) throw new Error('No wallet address');

      const { getSignerAddressDynamic } = await import('@/lib/alkanes/helpers');
      const { buildAtomicWrapSwapProtostones } = await import('@/lib/alkanes/builders');
      stamp('dynamic imports loaded');

      const wrapFeePerThousand = premiumData?.wrapFeePerThousand ?? FRBTC_WRAP_FEE_PER_1000;
      const btcSats = new BigNumber(params.btcAmount).multipliedBy(1e8).integerValue(BigNumber.ROUND_FLOOR);
      const frbtcAfterFee = btcSats.multipliedBy(1000 - wrapFeePerThousand).dividedBy(1000)
        .integerValue(BigNumber.ROUND_FLOOR).toString();
      stamp(`fee math done (btcSats=${btcSats.toString()}, frbtcAfterFee=${frbtcAfterFee})`);

      // Block height via the WASM provider — the localStorage path was
      // unreliable (stale "NaN" propagating into the cellpack as
      // "Invalid edict format"). Same pattern as
      // useRemoveLiquidityMutation / useSwapMutation.
      // Wrap with a hard timeout so a hung WASM call surfaces visibly
      // instead of spinning forever.
      const deadline = await Promise.race([
        getFutureBlockHeight(params.deadlineBlocks, provider as any).then(String),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getFutureBlockHeight: 15s timeout')), 15_000),
        ),
      ]);
      stamp(`deadline resolved (${deadline})`);

      const protostones = buildAtomicWrapSwapProtostones({
        factoryId: config.ALKANE_FACTORY_ID,
        buyTokenId: params.buyTokenId,
        sellAmount: frbtcAfterFee,
        minOutput: params.minimumReceived || '1',
        deadline,
      });
      stamp('protostones built');

      const signerAddress = await Promise.race([
        getSignerAddressDynamic(network),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getSignerAddressDynamic: 15s timeout')), 15_000),
        ),
      ]);
      stamp(`signerAddress resolved (${signerAddress})`);

      stamp('handing off to swapMutation.mutateAsync — wallet modal should appear next');
      return swapMutation.mutateAsync({
        sellCurrency: 'btc',
        buyCurrency: params.buyTokenId,
        direction: 'sell',
        sellAmount: btcSats.toString(),
        buyAmount: params.quoteBuyAmount,
        maxSlippage: params.maxSlippage,
        feeRate: params.feeRate,
        poolId: params.poolId,
        deadlineBlocks: params.deadlineBlocks,
        // Override protostones and addresses for atomic wrap+swap.
        // v0 = signer (BTC), v1 = user (swap output).
        overrideProtostones: protostones,
        overrideToAddresses: [signerAddress, address],
        overrideInputRequirements: `B:${btcSats.toString()}:v0`,
        // Default-on for mainnet: combined wrap+swap fuel exceeds the
        // MINIMUM_FUEL_CHANGE1 floor (3.5M) so the original atomic flow
        // OOGs whenever block_fuel is exhausted by earlier txs. Splitting
        // the wrap into a parent tx avoids the race entirely. Devnet /
        // regtest get full block_fuel each tx so the atomic flow is fine
        // there — leave it off to keep existing test paths unchanged.
        splitTransactions: params.splitTransactions ?? (network === 'mainnet'),
      } as any);
    },
    [network, address, premiumData, swapMutation, provider],
  );

  return {
    executeAtomicSwap,
    isPending: swapMutation.isPending,
    error: swapMutation.error,
  };
}
