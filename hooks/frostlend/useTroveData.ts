'use client';

/**
 * useTroveData / useTroveById — read a trove's coll/debt/status/ICR from TroveManager.
 *
 * Trove identity strategy: the receipt alkane at [2, sequence_n] IS the trove's identity.
 * It lives in the user's wallet — whoever holds it owns the trove. localStorage is a
 * performance cache only; if it's missing we scan the wallet's [2,*] holdings and
 * reverse-lookup via TM.GetTroveAuthToken(i) to recover (troveId, authTokenId).
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
import { readCachedTrove, writeCachedTrove } from '@/lib/frostlend/troveCache';
import { fetchUserBlock2Receipts } from '@/lib/frostlend/receipts';

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
 * Scan the wallet's [2,*] holdings and reverse-lookup via TM.GetTroveAuthToken(i)
 * to find the active trove. Returns (troveId, authTokenId) or null.
 * Used as cold-start fallback when localStorage is empty.
 */
async function discoverTroveFromWallet(
  network: string,
  address: string,
): Promise<{ troveId: string; authTokenId: string } | null> {
  const receipts = await fetchUserBlock2Receipts(network, address);
  if (receipts.length === 0) return null;

  const walletTxSet = new Set(receipts.map(r => r.tx.toString()));
  const tmTarget = parseAlkaneTarget(FROSTLEND_CONTRACTS.TROVE_MANAGER);

  const countExec = await simulateAlkane(network, tmTarget, [
    TROVE_MANAGER_OPCODES.GetTroveCount.toString(),
  ]);
  const count = parseU128(countExec);
  if (count === 0n) return null;

  // Scan trove IDs 1..count*2+5 (allows for closed troves inflating next_id).
  const upperBound = Number(count) * 2 + 5;
  for (let i = 1; i <= upperBound; i++) {
    const authExec = await simulateAlkane(network, tmTarget, [
      TROVE_MANAGER_OPCODES.GetTroveAuthToken.toString(),
      i.toString(),
    ]);
    const raw = authExec?.data;
    if (!raw || typeof raw !== 'string') continue;
    const clean = raw.replace(/^0x/, '');
    if (clean.length < 64) continue;
    const txBytes = clean.slice(32, 64);
    const txLe = BigInt('0x' + (txBytes.match(/.{2}/g) || []).reverse().join(''));
    if (walletTxSet.has(txLe.toString())) {
      return { troveId: i.toString(), authTokenId: `2:${txLe}` };
    }
  }
  return null;
}

/**
 * Read the connected wallet's trove. localStorage is checked first (fast path);
 * if empty, the wallet's [2,*] receipt holdings are scanned to recover the trove.
 * The receipt alkane IS the source of truth — localStorage is a cache only.
 */
export function useTroveData() {
  const { account, network, isConnected } = useWallet();
  const address = account?.taproot?.address || account?.nativeSegwit?.address || '';

  const cached = useMemo(() => {
    if (!network || !address) return null;
    return readCachedTrove(network, address);
  }, [network, address]);

  return useQuery({
    queryKey: ['frostlend', 'trove', network, address],
    queryFn: async (): Promise<TroveData | null> => {
      if (!network || !address) return null;

      // Fast path: use cached (troveId, authTokenId) from localStorage.
      let resolved = cached
        ? { troveId: cached.troveId, authTokenId: cached.authTokenId }
        : null;

      // Cold-start path: scan wallet [2,*] receipts and reverse-lookup via TM.
      if (!resolved) {
        const discovered = await discoverTroveFromWallet(network, address);
        if (discovered) {
          writeCachedTrove(network, address, discovered.troveId, discovered.authTokenId);
          resolved = discovered;
        }
      }

      if (!resolved) return null;

      const fields = await fetchTroveById(network, resolved.troveId);
      if (!fields) return null;
      if (fields.status === TROVE_STATUS.NonExistent) return null;
      const price = await fetchOraclePrice(network);
      const currentIcr = computeIcr(fields.collateralFrbtc, fields.debtFrostUsd, price);
      return {
        troveId: resolved.troveId,
        collateralFrbtc: fields.collateralFrbtc,
        debtFrostUsd: fields.debtFrostUsd,
        status: fields.status,
        currentIcr,
        authTokenId: resolved.authTokenId,
        isActive: fields.status === TROVE_STATUS.Active,
      };
    },
    enabled: isConnected && !!network && !!address,
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
