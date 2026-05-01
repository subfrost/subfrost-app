'use client';

/**
 * useSystemData — protocol-wide stats: TCR, recovery mode, total troves, total
 * coll/debt, current oracle price, borrowing/redemption rates.
 *
 * All reads via alkanes_simulate. TCR and recovery-mode require the current price
 * passed as an argument (TroveManager opcodes 24, 25). The price is read first
 * from PriceFeed, then forwarded.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import {
  CCR,
  FROSTLEND_CONTRACTS,
  MCR,
  TROVE_MANAGER_OPCODES,
  price18DecToUsd,
} from '@/constants/frostlend';
import { parseAlkaneTarget, parseU128, parseU8, simulateAlkane } from '@/lib/frostlend/rpc';

export type SystemData = {
  /** Oracle price (18-decimal fixed-point USD per BTC). */
  price18Dec: bigint;
  /** Convenience: oracle price as USD float (e.g. 50000.00). */
  priceUsd: number;
  /** Total Collateral Ratio (18-dec). 0 if no troves. */
  tcr: bigint;
  /** True iff TCR < CCR (system-wide recovery mode). */
  isRecoveryMode: boolean;
  /** Number of active troves. */
  troveCount: number;
  /** System-wide active+default coll (frBTC sats, u128). */
  totalCollateral: bigint;
  /** System-wide active+default debt (frostUSD sats, u128). */
  totalDebt: bigint;
  /** Borrowing fee rate (18-dec, e.g. 5e15 = 0.5%). */
  borrowingRate: bigint;
  /** Redemption fee rate (18-dec). */
  redemptionRate: bigint;
};

export function useSystemData() {
  const { network } = useWallet();

  return useQuery({
    queryKey: ['frostlend', 'system', network],
    queryFn: async (): Promise<SystemData | null> => {
      if (!network) return null;
      const tmTarget = parseAlkaneTarget(FROSTLEND_CONTRACTS.TROVE_MANAGER);
      const pfTarget = parseAlkaneTarget(FROSTLEND_CONTRACTS.PRICE_FEED);

      // 1. Read oracle price first (needed for TCR and recovery-mode calls).
      const priceExec = await simulateAlkane(network, pfTarget, ['30']); // GetStoredPrice
      const price18Dec = parseU128(priceExec);

      // 2. Parallel reads of system stats (some need price as arg).
      const priceArg = price18Dec.toString();
      const [
        tcrExec,
        recoveryExec,
        countExec,
        sysCollExec,
        sysDebtExec,
        borrowingExec,
        redemptionExec,
      ] = await Promise.all([
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.GetTcr.toString(), priceArg]),
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.CheckRecoveryMode.toString(), priceArg]),
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.GetTroveCount.toString()]),
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.GetEntireSystemColl.toString()]),
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.GetEntireSystemDebt.toString()]),
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.GetBorrowingRate.toString()]),
        simulateAlkane(network, tmTarget, [TROVE_MANAGER_OPCODES.GetRedemptionRate.toString()]),
      ]);

      return {
        price18Dec,
        priceUsd: price18Dec === 0n ? 0 : price18DecToUsd(price18Dec),
        tcr: parseU128(tcrExec),
        isRecoveryMode: parseU8(recoveryExec) === 1,
        troveCount: Number(parseU128(countExec)),
        totalCollateral: parseU128(sysCollExec),
        totalDebt: parseU128(sysDebtExec),
        borrowingRate: parseU128(borrowingExec),
        redemptionRate: parseU128(redemptionExec),
      };
    },
    enabled: !!network,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

/** Convenience selector: just the recovery-mode flag. */
export function useRecoveryMode(): boolean {
  const { data } = useSystemData();
  return data?.isRecoveryMode ?? false;
}

// Re-export thresholds so the dashboard can render them without re-importing constants.
export { MCR, CCR };
