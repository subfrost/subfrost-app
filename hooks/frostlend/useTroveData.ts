'use client';

/**
 * useTroveData / useTroveById — read a trove's coll/debt/status/ICR from TroveManager.
 *
 * Trove identity strategy: the OpenTrove response contains the assigned u128 trove_id
 * in its first 16 bytes. The mutation hook persists this to localStorage via
 * `writeCachedTrove(network, address, troveId, authTokenId)`. This hook reads from
 * that cache, then queries TroveManager via alkanes_simulate.
 *
 * The Trove dashboard renders these fields:
 *   - collateralFrbtc:   /troves/{id}/coll  (u128 sats)
 *   - debtFrostUsd:      /troves/{id}/debt  (u128 sats)
 *   - status:            /troves/{id}/status (u8 — 0=NonExistent, 1=Active, ...)
 *   - currentIcr:        coll * price / debt (computed off-chain or via opcode 32)
 *   - nominalIcr:        coll * NICR_PRECISION / debt (opcode 31)
 *
 * Source: reference/frost-lend/alkanes/frost-lend-trove-manager/src/lib.rs (opcodes 20–32).
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import {
  FROSTLEND_CONTRACTS,
  TROVE_MANAGER_OPCODES,
  TROVE_STATUS,
  type TroveStatus,
  computeIcr,
} from '@/constants/frostlend';
import { parseAlkaneTarget, parseU128, parseU8, simulateAlkane } from '@/lib/frostlend/rpc';
import { readCachedTrove } from '@/lib/frostlend/troveCache';

export type TroveData = {
  troveId: string;
  collateralFrbtc: bigint;
  debtFrostUsd: bigint;
  status: TroveStatus;
  /** Computed ICR (18-decimal fixed-point) given the current oracle price. */
  currentIcr: bigint;
  authTokenId: string | null;
  /** Convenience: true iff status === Active. */
  isActive: boolean;
};

async function fetchTroveById(network: string, troveId: string): Promise<{
  collateralFrbtc: bigint;
  debtFrostUsd: bigint;
  status: TroveStatus;
} | null> {
  const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.TROVE_MANAGER);
  // Pass trove_id as a single u128 string — alkanes_simulate accepts it as one input.
  const [collExec, debtExec, statusExec] = await Promise.all([
    simulateAlkane(network, target, [TROVE_MANAGER_OPCODES.GetTroveColl.toString(), troveId]),
    simulateAlkane(network, target, [TROVE_MANAGER_OPCODES.GetTroveDebt.toString(), troveId]),
    simulateAlkane(network, target, [TROVE_MANAGER_OPCODES.GetTroveStatus.toString(), troveId]),
  ]);
  const collateralFrbtc = parseU128(collExec);
  const debtFrostUsd = parseU128(debtExec);
  const status = parseU8(statusExec) as TroveStatus;
  return { collateralFrbtc, debtFrostUsd, status };
}

async function fetchOraclePrice(network: string): Promise<bigint> {
  const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.PRICE_FEED);
  const exec = await simulateAlkane(network, target, ['30']); // GetStoredPrice
  return parseU128(exec);
}

/**
 * Read the connected wallet's trove (looked up from localStorage cache).
 * Returns null if no cached trove ID is present, or if the trove is non-existent.
 */
export function useTroveData() {
  const { account, network, isConnected } = useWallet();
  const address = account?.taproot?.address || account?.nativeSegwit?.address || '';

  const cached = useMemo(() => {
    if (!network || !address) return null;
    return readCachedTrove(network, address);
  }, [network, address]);

  return useQuery({
    queryKey: ['frostlend', 'trove', network, address, cached?.troveId],
    queryFn: async (): Promise<TroveData | null> => {
      if (!network || !cached) return null;
      const fields = await fetchTroveById(network, cached.troveId);
      if (!fields) return null;
      if (fields.status === TROVE_STATUS.NonExistent) return null;
      const price = await fetchOraclePrice(network);
      const currentIcr = computeIcr(fields.collateralFrbtc, fields.debtFrostUsd, price);
      return {
        troveId: cached.troveId,
        collateralFrbtc: fields.collateralFrbtc,
        debtFrostUsd: fields.debtFrostUsd,
        status: fields.status,
        currentIcr,
        authTokenId: cached.authTokenId,
        isActive: fields.status === TROVE_STATUS.Active,
      };
    },
    enabled: isConnected && !!network && !!cached,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}

/** Direct read of any trove by ID (for the devnet helper / liquidation UI). */
export function useTroveById(troveId: string | null | undefined) {
  const { network } = useWallet();
  return useQuery({
    queryKey: ['frostlend', 'trove-by-id', network, troveId],
    queryFn: async (): Promise<TroveData | null> => {
      if (!network || !troveId) return null;
      const fields = await fetchTroveById(network, troveId);
      if (!fields || fields.status === TROVE_STATUS.NonExistent) return null;
      const price = await fetchOraclePrice(network);
      const currentIcr = computeIcr(fields.collateralFrbtc, fields.debtFrostUsd, price);
      return {
        troveId,
        collateralFrbtc: fields.collateralFrbtc,
        debtFrostUsd: fields.debtFrostUsd,
        status: fields.status,
        currentIcr,
        authTokenId: null,
        isActive: fields.status === TROVE_STATUS.Active,
      };
    },
    enabled: !!network && !!troveId,
    staleTime: 5_000,
  });
}
