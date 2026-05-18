'use client';

/**
 * useRedeemMutation — redeem frostUSD for frBTC at face value (minus redemption fee).
 *
 * Permissionless after the 14-day bootstrap window. The redemption walks SortedTroves
 * from lowest ICR up, repaying debt and transferring proportional collateral to the
 * redeemer. The user MUST send frostUSD as incoming alkane — the protocol burns it.
 *
 * Source: reference/frost-lend/alkanes/frost-lend-trove-manager/src/lib.rs
 *   RedeemCollateral { max_iterations, max_fee_percentage } — opcode 5
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MAX_BORROWING_FEE,
  TROVE_MANAGER_OPCODES,
  TROVE_MANAGER_TX,
} from '@/constants/frostlend';
import { useFrostlendExecute } from './useFrostlendExecute';

const FROST_USD_TX = 0x200;

function buildTmCellpack(opcode: number, args: bigint[]): string {
  const cellpack = [4, TROVE_MANAGER_TX, opcode, ...args.map(a => a.toString())].join(',');
  return `[${cellpack}]:v0:v0`;
}

export type RedeemParams = {
  amountFrostUsdSats: bigint;
  /** Max number of troves to walk during redemption. Liquity's default = no limit (huge u128). */
  maxIterations?: bigint;
  /** Max acceptable redemption fee (18-dec). Defaults to MAX_BORROWING_FEE (5%). */
  maxFeePercentage?: bigint;
  feeRate: number;
};

export function useRedeemMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RedeemParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');

      const protostones = buildTmCellpack(TROVE_MANAGER_OPCODES.RedeemCollateral, [
        params.maxIterations ?? 100n,
        params.maxFeePercentage ?? MAX_BORROWING_FEE,
      ]);
      const inputRequirements = `4:${FROST_USD_TX}:${params.amountFrostUsdSats.toString()}`;

      // skipTaprootFeeSources: redeem uses frostUSD (not trove auth token);
      // excluding taproot from fee sources prevents burning any trove receipt UTXOs.
      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate, skipTaprootFeeSources: true });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}
