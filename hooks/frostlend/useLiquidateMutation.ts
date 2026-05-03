'use client';

/**
 * useLiquidateMutation — permissionless liquidation of an undercollateralized trove.
 *
 * Source: reference/frost-lend/alkanes/frost-lend-trove-manager/src/lib.rs
 *   - Liquidate(trove_id) — opcode 4
 *   - LiquidateTroves(max_count) — opcode 7 (batch from worst ICR up)
 *
 * No auth token required. Caller receives frBTC gas compensation as a reward.
 *
 * ⚠️ DISCOVERY (2026-05-03): alkanesExecuteFull (devnet) silently swallows
 * contract reverts when called with mine_enabled=true. Without a pre-flight
 * simulate, the user sees a green toast even when the on-chain liquidation
 * was rejected. We now ALWAYS pre-flight the call via alkanes_simulate so
 * the revert reason ("not liquidatable in recovery mode", "trove not active",
 * etc.) surfaces immediately as the mutation error — turning a silent failure
 * into a visible one.
 *
 * Common reverts the pre-flight catches:
 *   - "trove not active" — trove was already closed/liquidated
 *   - "not liquidatable in normal mode" — trove ICR ≥ MCR (110%)
 *   - "not liquidatable in recovery mode" — trove ICR ≥ TCR (mathematically
 *     vacuous when there's only ONE trove in the system, since TCR == ICR)
 *
 * Verified via __tests__/devnet/e2e-frostlend.test.ts where TC9 demonstrates
 * the silent-failure mode and TC9b shows the working multi-trove case.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TROVE_MANAGER_OPCODES, TROVE_MANAGER_TX, FROSTLEND_CONTRACTS } from '@/constants/frostlend';
import { useFrostlendExecute } from './useFrostlendExecute';
import { parseAlkaneTarget, simulateAlkane } from '@/lib/frostlend/rpc';

function buildTmCellpack(opcode: number, args: bigint[]): string {
  const cellpack = [4, TROVE_MANAGER_TX, opcode, ...args.map(a => a.toString())].join(',');
  return `[${cellpack}]:v0:v0`;
}

export type LiquidateParams = {
  troveId: bigint;
  feeRate: number;
};

/**
 * Pre-flight a TroveManager call by simulating it. Returns the contract's
 * revert reason if the call would fail, or null if it would succeed. This
 * compensates for alkanesExecuteFull swallowing reverts on devnet.
 */
async function preflightLiquidate(
  network: string,
  troveId: bigint,
  opcode: number,
  args: bigint[],
): Promise<string | null> {
  try {
    const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.TROVE_MANAGER);
    const inputs = [opcode.toString(), troveId.toString(), ...args.map(a => a.toString())];
    const exec = await simulateAlkane(network, target, inputs);
    if (exec?.error) return exec.error;
    return null;
  } catch (e: any) {
    return e?.message || 'simulate failed';
  }
}

export function useLiquidateTroveMutation() {
  const { execute, network, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: LiquidateParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');

      // Pre-flight via alkanes_simulate — catch reverts the SDK would silence.
      const revert = await preflightLiquidate(
        network, params.troveId, TROVE_MANAGER_OPCODES.Liquidate, [],
      );
      if (revert) {
        // Strip the "ALKANES: revert: Error: " prefix for cleaner UI display.
        const clean = revert.replace(/^ALKANES:\s*revert:\s*Error:\s*/, '').trim();
        throw new Error(clean);
      }

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
  const { execute, network, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: BatchLiquidateParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');

      // Pre-flight LiquidateTroves(max_count) — catches 'no liquidatable troves'.
      const revert = await preflightLiquidate(
        network, params.maxCount, TROVE_MANAGER_OPCODES.LiquidateTroves, [],
      );
      if (revert) {
        const clean = revert.replace(/^ALKANES:\s*revert:\s*Error:\s*/, '').trim();
        throw new Error(clean);
      }

      const protostones = buildTmCellpack(TROVE_MANAGER_OPCODES.LiquidateTroves, [params.maxCount]);
      const { txid } = await execute({ protostones, inputRequirements: '', feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}
