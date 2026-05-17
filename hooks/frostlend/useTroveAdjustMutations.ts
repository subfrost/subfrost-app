'use client';

/**
 * Per-action trove adjustment hooks. Each mutation is a separate hook so the
 * UI can render simple per-button affordances (Add Collateral / Withdraw / Draw /
 * Repay / Close / Claim Surplus). The contract has a unified AdjustTrove (opcode 2)
 * but the individual opcodes (4–8) are simpler protostones with fewer args.
 *
 * Auth-token rule: every owner op except OpenTrove requires the trove auth token
 * to be present in `incoming_alkanes`. The auth token ID lives in localStorage
 * (cached after OpenTrove returns it). All hooks here expect the trove to be
 * cached — useTroveData() reading null means user has no trove and these mutations
 * should not be invoked.
 *
 * Source: reference/frost-lend/alkanes/frost-lend-borrower-ops/src/lib.rs
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BORROWER_OPS_OPCODES,
  BORROWER_OPS_TX,
  FROST_USD_GAS_COMPENSATION,
  MAX_BORROWING_FEE,
} from '@/constants/frostlend';
import { useFrostlendExecute } from './useFrostlendExecute';
import { readCachedTrove, clearCachedTrove } from '@/lib/frostlend/troveCache';
import { useWallet } from '@/context/WalletContext';

// -- helpers ---------------------------------------------------------------

function getAuthTokenInputRequirement(authTokenId: string): string {
  return `${authTokenId}:1`; // 1 unit of the auth token
}

function combineInputRequirements(parts: string[]): string {
  return parts.filter(Boolean).join(',');
}

function buildBorrowerOpsCellpack(opcode: number, args: bigint[]): string {
  const cellpack = [4, BORROWER_OPS_TX, opcode, ...args.map(a => a.toString())].join(',');
  return `[${cellpack}]:v0:v0`;
}

function useCachedTroveOrThrow() {
  const { account, network } = useWallet();
  const address = account?.taproot?.address || account?.nativeSegwit?.address || '';
  const cached = network && address ? readCachedTrove(network, address) : null;
  return { cached, network: network ?? '', address };
}

// -- AddColl (opcode 4) -----------------------------------------------------

export type AddCollateralParams = {
  /** frBTC sats to add. */
  collateralFrbtcSats: bigint;
  feeRate: number;
  hintPrev?: bigint;
  hintNext?: bigint;
};

export function useAddCollateralMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();
  const { cached } = useCachedTroveOrThrow();

  return useMutation({
    mutationFn: async (params: AddCollateralParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!cached) throw new Error('No trove found in local cache');
      if (!cached.authTokenId) throw new Error('Auth token unknown — cannot adjust trove');

      const protostones = buildBorrowerOpsCellpack(BORROWER_OPS_OPCODES.AddColl, [
        BigInt(cached.troveId),
        params.hintPrev ?? 0n,
        params.hintNext ?? 0n,
      ]);
      const inputRequirements = combineInputRequirements([
        `32:0:${params.collateralFrbtcSats.toString()}`,
        getAuthTokenInputRequirement(cached.authTokenId),
      ]);

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- WithdrawColl (opcode 5) -----------------------------------------------

export type WithdrawCollateralParams = {
  /** frBTC sats to withdraw. */
  amountFrbtcSats: bigint;
  feeRate: number;
  hintPrev?: bigint;
  hintNext?: bigint;
};

export function useWithdrawCollateralMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();
  const { cached } = useCachedTroveOrThrow();

  return useMutation({
    mutationFn: async (params: WithdrawCollateralParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!cached) throw new Error('No trove found in local cache');
      if (!cached.authTokenId) throw new Error('Auth token unknown — cannot adjust trove');

      const protostones = buildBorrowerOpsCellpack(BORROWER_OPS_OPCODES.WithdrawColl, [
        BigInt(cached.troveId),
        params.amountFrbtcSats,
        params.hintPrev ?? 0n,
        params.hintNext ?? 0n,
      ]);
      const inputRequirements = getAuthTokenInputRequirement(cached.authTokenId);

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- DrawFrostUsd (opcode 6) -----------------------------------------------

export type DrawFrostUsdParams = {
  /** Additional frostUSD sats to mint. */
  amountFrostUsdSats: bigint;
  feeRate: number;
  hintPrev?: bigint;
  hintNext?: bigint;
  maxFeePercentage?: bigint;
};

export function useDrawFrostUsdMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();
  const { cached } = useCachedTroveOrThrow();

  return useMutation({
    mutationFn: async (params: DrawFrostUsdParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!cached) throw new Error('No trove found in local cache');
      if (!cached.authTokenId) throw new Error('Auth token unknown — cannot adjust trove');

      const protostones = buildBorrowerOpsCellpack(BORROWER_OPS_OPCODES.DrawFrostUsd, [
        BigInt(cached.troveId),
        params.amountFrostUsdSats,
        params.hintPrev ?? 0n,
        params.hintNext ?? 0n,
        params.maxFeePercentage ?? MAX_BORROWING_FEE,
      ]);
      const inputRequirements = getAuthTokenInputRequirement(cached.authTokenId);

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- RepayFrostUsd (opcode 7) ----------------------------------------------
// User sends frostUSD as incoming alkane; protocol burns it and reduces debt.

export type RepayFrostUsdParams = {
  /** frostUSD sats to repay. Must be sent as incoming alkane. */
  amountFrostUsdSats: bigint;
  feeRate: number;
  hintPrev?: bigint;
  hintNext?: bigint;
};

export function useRepayFrostUsdMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();
  const { cached } = useCachedTroveOrThrow();

  return useMutation({
    mutationFn: async (params: RepayFrostUsdParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!cached) throw new Error('No trove found in local cache');
      if (!cached.authTokenId) throw new Error('Auth token unknown — cannot adjust trove');

      // Use FROST_USD_TOKEN_TX from constants — block 4, tx 0x200 (= 512).
      const FROST_USD_TX = 0x200;
      const protostones = buildBorrowerOpsCellpack(BORROWER_OPS_OPCODES.RepayFrostUsd, [
        BigInt(cached.troveId),
        params.hintPrev ?? 0n,
        params.hintNext ?? 0n,
      ]);
      const inputRequirements = combineInputRequirements([
        `4:${FROST_USD_TX}:${params.amountFrostUsdSats.toString()}`,
        getAuthTokenInputRequirement(cached.authTokenId),
      ]);

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- CloseTrove (opcode 3) -------------------------------------------------
// Repay net debt + claim collateral. The contract retrieves gas_comp internally
// from the GasPool (same as Liquity v1 semantics). User only needs to send the
// NET debt (raw_debt - gas_compensation) in frostUSD.
// JOURNAL 2026-05-17: discovered via smoke test run 16 error "need 210950000000
// of 4:512, have 190000000000" — wallet never accumulates gas_comp since it is
// minted directly to GasPool on OpenTrove. Subtracting gas_comp here matches the
// Liquity v1 BorrowerOps.closeTrove() semantics where user repays net_debt only.

export type CloseTroveParams = {
  /** Raw frostUSD debt from GetTroveDebt (net + gas_comp). The hook subtracts
   *  gas_comp before building the input requirement so only net debt is sent. */
  totalDebtFrostUsdSats: bigint;
  feeRate: number;
};

export function useCloseTroveMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();
  const { cached, network, address } = useCachedTroveOrThrow();

  return useMutation({
    mutationFn: async (params: CloseTroveParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!cached) throw new Error('No trove found in local cache');
      if (!cached.authTokenId) throw new Error('Auth token unknown — cannot close trove');

      // Net debt = raw_debt - gas_comp. The GasPool covers gas_comp internally.
      const netDebt = params.totalDebtFrostUsdSats > FROST_USD_GAS_COMPENSATION
        ? params.totalDebtFrostUsdSats - FROST_USD_GAS_COMPENSATION
        : params.totalDebtFrostUsdSats;

      const FROST_USD_TX = 0x200;
      const protostones = buildBorrowerOpsCellpack(BORROWER_OPS_OPCODES.CloseTrove, [
        BigInt(cached.troveId),
      ]);
      const inputRequirements = combineInputRequirements([
        `4:${FROST_USD_TX}:${netDebt.toString()}`,
        getAuthTokenInputRequirement(cached.authTokenId),
      ]);

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });

      // Auth token is consumed on close — wipe local cache.
      if (network && address) clearCachedTrove(network, address);
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- ClaimCollateral (opcode 8) -- after capped liquidation ----------------
// User claims surplus collateral from CollSurplusPool. Auth token consumed.

export function useClaimCollateralMutation() {
  const { execute, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();
  const { cached, network, address } = useCachedTroveOrThrow();

  return useMutation({
    mutationFn: async (params: { feeRate: number }) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!cached) throw new Error('No trove found in local cache');
      if (!cached.authTokenId) throw new Error('Auth token unknown');

      const protostones = buildBorrowerOpsCellpack(BORROWER_OPS_OPCODES.ClaimCollateral, [
        BigInt(cached.troveId),
      ]);
      const inputRequirements = getAuthTokenInputRequirement(cached.authTokenId);

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });

      if (network && address) clearCachedTrove(network, address);
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}
