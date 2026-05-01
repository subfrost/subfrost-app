'use client';

/**
 * useLiquidateMutation — permissionless liquidation of an undercollateralized trove.
 *
 * Source: reference/frost-lend/alkanes/frost-lend-trove-manager/src/lib.rs
 *   - Liquidate(trove_id) — opcode 4
 *   - LiquidateTroves(max_count) — opcode 7 (batch from worst ICR up)
 *
 * No auth token required. Caller receives frBTC gas compensation as a reward.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TROVE_MANAGER_OPCODES, TROVE_MANAGER_TX } from '@/constants/frostlend';
import { useFrostlendExecute } from './useFrostlendExecute';

function buildTmCellpack(opcode: number, args: bigint[]): string {
  const cellpack = [4, TROVE_MANAGER_TX, opcode, ...args.map(a => a.toString())].join(',');
  return `[${cellpack}]:v0:v0`;
}

export type LiquidateParams = {
  troveId: bigint;
  feeRate: number;
};

export function useLiquidateTroveMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: LiquidateParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      const protostones = buildTmCellpack(TROVE_MANAGER_OPCODES.Liquidate, [params.troveId]);
      // No alkane inputs — liquidation is permissionless.
      const { txid } = await execute({ protostones, inputRequirements: '', feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

export type BatchLiquidateParams = {
  maxCount: bigint;
  feeRate: number;
};

export function useBatchLiquidateMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchLiquidateParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      const protostones = buildTmCellpack(TROVE_MANAGER_OPCODES.LiquidateTroves, [params.maxCount]);
      const { txid } = await execute({ protostones, inputRequirements: '', feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}
