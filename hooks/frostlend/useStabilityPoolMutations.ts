'use client';

/**
 * Stability Pool mutations: deposit, withdraw.
 *
 * Source: reference/frost-lend/alkanes/frost-lend-stability-pool/src/lib.rs
 *
 * Receipt model (boiler-style — receipt-by-passage):
 *   - Deposit (opcode 1): user sends frostUSD; SP spawns a depositor auth token
 *     at [2, sequence_n], mints 1 unit, returns it via response.alkanes.0[0].
 *   - Withdraw (opcode 2, args [depositor_id, amount]): user supplies the auth
 *     token in incoming_alkanes; SP verifies, processes, returns frostUSD +
 *     frBTC gains. Auth token is consumed (no return) on full withdrawal.
 *
 * The receipt alkane IS the source of truth — whoever holds it owns the position.
 * localStorage is a performance cache only. If it's empty, useSpWithdrawMutation
 * and useSpDepositData scan the wallet's [2,*] holdings and probe
 * SP.GetDepositorAuthToken(i) to recover (depositor_id, authTokenId).
 *
 * Capture technique (no GetDepositorCount opcode exists):
 *   1. Pre-deposit: snapshot user's [2,*] outpoints.
 *   2. Submit deposit + mine.
 *   3. Re-fetch [2,*] outpoints. The newly added entry IS the depositor receipt.
 *   4. Probe SP.GetDepositorAuthToken(i) for i in [1..50] to recover depositor_id.
 */

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { STABILITY_POOL_OPCODES, STABILITY_POOL_TX } from '@/constants/frostlend';
import { useFrostlendExecute } from './useFrostlendExecute';
import { useWallet } from '@/context/WalletContext';
import {
  readCachedSpDeposit,
  writeCachedSpDeposit,
} from '@/lib/frostlend/spCache';
import { parseAlkaneTarget, parseU128, simulateAlkane } from '@/lib/frostlend/rpc';
import {
  diffNewReceipt,
  fetchCompoundedDeposit,
  fetchDepositorFrbtcGain,
  fetchUserBlock2Receipts,
  findDepositorIdByAuthToken,
} from '@/lib/frostlend/receipts';
import { FROSTLEND_CONTRACTS } from '@/constants/frostlend';

const FROST_USD_TX = 0x200;

function buildSpCellpack(opcode: number, args: bigint[]): string {
  const cellpack = [4, STABILITY_POOL_TX, opcode, ...args.map(a => a.toString())].join(',');
  return `[${cellpack}]:v0:v0`;
}

/**
 * Scan wallet [2,*] receipts and probe SP.GetDepositorAuthToken(i) to find
 * which depositor_id maps to a receipt the user holds. Returns the cached
 * representation or null. Used as cold-start fallback when localStorage is empty.
 */
async function discoverSpDepositFromWallet(
  network: string,
  address: string,
): Promise<{ depositorId: string; authTokenId: string } | null> {
  const receipts = await fetchUserBlock2Receipts(network, address);
  if (receipts.length === 0) return null;

  const walletTxSet = new Set(receipts.map(r => r.tx.toString()));
  const authTokenTx = receipts.reduce<bigint | null>((best, r) =>
    best === null || r.tx > best ? r.tx : best, null);
  if (authTokenTx === null) return null;

  const depositorId = await findDepositorIdByAuthToken(network, authTokenTx);
  if (!depositorId) return null;
  return { depositorId, authTokenId: `2:${authTokenTx}` };
}

// -- Deposit -----------------------------------------------------------------

export type SpDepositParams = {
  amountFrostUsdSats: bigint;
  feeRate: number;
};

export function useSpDepositMutation() {
  const { execute, primaryAddress, network, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SpDepositParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!primaryAddress || !network) throw new Error('No wallet address');

      // 1. Snapshot user's [2,*] receipts before submitting.
      const beforeReceipts = await fetchUserBlock2Receipts(network, primaryAddress);
      const beforeTxs = beforeReceipts.map(r => r.tx);

      // 2. Submit deposit.
      const protostones = buildSpCellpack(STABILITY_POOL_OPCODES.Deposit, []);
      const inputRequirements = `4:${FROST_USD_TX}:${params.amountFrostUsdSats.toString()}`;
      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });

      // 3. Re-fetch and diff to find the freshly-spawned receipt.
      // Devnet mines synchronously inside alkanesExecuteFull, so the indexer is
      // already current. On real networks we'd need to wait/poll for confirmation.
      let depositorId: string | null = null;
      let authTokenId: string | null = null;
      try {
        const after = await fetchUserBlock2Receipts(network, primaryAddress);
        const newReceiptTx = diffNewReceipt(beforeTxs, after);
        if (newReceiptTx !== null) {
          authTokenId = `2:${newReceiptTx}`;
          // 4. Probe to map auth-token tx field → depositor_id.
          depositorId = await findDepositorIdByAuthToken(network, newReceiptTx);
        }
      } catch {
        // best-effort — if discovery fails the user can re-deposit and the next
        // capture should succeed.
      }

      if (depositorId && authTokenId) {
        writeCachedSpDeposit(network, primaryAddress, depositorId, authTokenId);
      }

      return { txid, depositorId, authTokenId };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- Withdraw ----------------------------------------------------------------

export type SpWithdrawParams = {
  amountFrostUsdSats: bigint;
  feeRate: number;
};

export function useSpWithdrawMutation() {
  const { execute, ready, primaryAddress, network: execNetwork } = useFrostlendExecute();
  const { account, network } = useWallet();
  const address = account?.taproot?.address || account?.nativeSegwit?.address || primaryAddress || '';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SpWithdrawParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');
      if (!network || !address) throw new Error('No wallet address');

      // Fast path: use localStorage cache.
      const cached = readCachedSpDeposit(network, address);
      let depositorId = cached?.depositorId ?? null;
      let authTokenId = cached?.authTokenId ?? null;

      // Cold-start path: scan wallet [2,*] receipts to discover the SP deposit.
      if (!depositorId || !authTokenId) {
        const discovered = await discoverSpDepositFromWallet(network, address);
        if (discovered) {
          writeCachedSpDeposit(network, address, discovered.depositorId, discovered.authTokenId);
          depositorId = discovered.depositorId;
          authTokenId = discovered.authTokenId;
        }
      }

      if (!depositorId || !authTokenId) throw new Error('No SP deposit found in wallet or cache.');


      const protostones = buildSpCellpack(STABILITY_POOL_OPCODES.Withdraw, [
        BigInt(depositorId),
        params.amountFrostUsdSats,
      ]);
      // Pass the depositor receipt as incoming alkane — boiler's receipt-by-passage idiom.
      const inputRequirements = `${authTokenId}:1`;

      const { txid } = await execute({ protostones, inputRequirements, feeRate: params.feeRate });
      return { txid };
    },
    onSuccess: () => queryClient.refetchQueries({ queryKey: ['frostlend'] }),
  });
}

// -- Read aggregate SP state -------------------------------------------------

export async function fetchSpTotalDeposits(network: string): Promise<bigint> {
  const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.STABILITY_POOL);
  return parseU128(await simulateAlkane(network, target, [STABILITY_POOL_OPCODES.GetTotalDeposits.toString()]));
}

// -- Read user's SP position -------------------------------------------------

export type SpDepositData = {
  depositorId: string;
  authTokenId: string;
  compoundedDeposit: bigint;
  frbtcGain: bigint;
};

/**
 * Read the user's current SP position (compounded deposit + accrued frBTC gains).
 * localStorage is checked first (fast path); if empty, the wallet's [2,*] receipt
 * holdings are scanned to recover (depositor_id, authTokenId). The receipt alkane
 * IS the source of truth — localStorage is a cache only.
 */
export function useSpDepositData() {
  const { account, network } = useWallet();
  const address = account?.taproot?.address || account?.nativeSegwit?.address || '';

  return useQuery({
    queryKey: ['frostlend', 'sp-deposit', network, address],
    queryFn: async (): Promise<SpDepositData | null> => {
      if (!network || !address) return null;

      // Fast path.
      const cached = readCachedSpDeposit(network, address);
      let depositorId = cached?.depositorId ?? null;
      let authTokenId = cached?.authTokenId ?? null;

      // Cold-start path: scan wallet receipts.
      if (!depositorId || !authTokenId) {
        const discovered = await discoverSpDepositFromWallet(network, address);
        if (discovered) {
          writeCachedSpDeposit(network, address, discovered.depositorId, discovered.authTokenId);
          depositorId = discovered.depositorId;
          authTokenId = discovered.authTokenId;
        }
      }

      if (!depositorId || !authTokenId) return null;

      const [compoundedDeposit, frbtcGain] = await Promise.all([
        fetchCompoundedDeposit(network, depositorId),
        fetchDepositorFrbtcGain(network, depositorId),
      ]);
      // If both are zero, treat as no active deposit.
      if (compoundedDeposit === 0n && frbtcGain === 0n) return null;
      return {
        depositorId,
        authTokenId,
        compoundedDeposit,
        frbtcGain,
      };
    },
    enabled: !!network && !!address,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
