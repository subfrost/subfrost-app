'use client';

/**
 * useOpenTroveMutation — Open a new trove (post frBTC, mint frostUSD).
 *
 * Flow:
 *   1. Build cellpack: [4, BORROWER_OPS_TX, 1, frost_usd_amount, hint_prev, hint_next, max_fee].
 *   2. inputRequirements: "32:0:<frbtc_sats>" — SDK auto-edicts frBTC into the cellpack
 *      protostone, satisfying BorrowerOps' incoming_alkanes check.
 *   3. After tx mines, query TroveManager.GetTroveCount to recover the just-assigned
 *      trove_id (sequential u128: count - 1 = last opened). Cache it locally so
 *      useTroveData can read it back.
 *
 * Hint strategy (v1): pass 0/0. The contract falls back to a linear scan from the
 * tail of SortedTroves — fine for devnet with <100 troves. If/when the helper seeds
 * many background troves, we'll add a hint search via opcode 31 (GetNominalIcr) +
 * SortedTroves view ops.
 *
 * Two-protostone NOT needed here: the SDK auto-generates the edict from
 * inputRequirements. Single cellpack protostone suffices.
 *
 * Source: reference/frost-lend/alkanes/frost-lend-borrower-ops/src/lib.rs::open_trove
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BORROWER_OPS_OPCODES,
  BORROWER_OPS_TX,
  FROSTLEND_CONTRACTS,
  MAX_BORROWING_FEE,
} from '@/constants/frostlend';
import { useFrostlendExecute } from './useFrostlendExecute';
import { writeCachedTrove } from '@/lib/frostlend/troveCache';
import { parseAlkaneTarget, parseU128, simulateAlkane } from '@/lib/frostlend/rpc';
import { diffNewReceipt, fetchUserBlock2Receipts } from '@/lib/frostlend/receipts';

export type OpenTroveParams = {
  /** frBTC collateral in sats (8-decimal smallest unit). */
  collateralFrbtcSats: bigint;
  /** frostUSD debt to mint, in sats (8-decimal smallest unit). Must >= MIN_NET_DEBT. */
  debtFrostUsdSats: bigint;
  /** Sorted-troves hint, prev trove ID. 0 = no hint. */
  hintPrev?: bigint;
  /** Sorted-troves hint, next trove ID. 0 = no hint. */
  hintNext?: bigint;
  /** Max acceptable borrowing fee (18-dec fixed-point). Defaults to protocol max (5%). */
  maxFeePercentage?: bigint;
  feeRate: number;
};

function buildOpenTroveProtostone(params: {
  debtFrostUsdSats: bigint;
  hintPrev: bigint;
  hintNext: bigint;
  maxFeePercentage: bigint;
}): string {
  const cellpack = [
    4, // deployed block
    BORROWER_OPS_TX,
    BORROWER_OPS_OPCODES.OpenTrove,
    params.debtFrostUsdSats.toString(),
    params.hintPrev.toString(),
    params.hintNext.toString(),
    params.maxFeePercentage.toString(),
  ].join(',');
  // pointer=v0 / refund=v0 — SDK auto-builds p0 (edict) and this becomes p1.
  return `[${cellpack}]:v0:v0`;
}

function buildFrbtcInputRequirements(amountSats: bigint): string {
  // "block:tx:amount" — SDK builds the auto-edict from this.
  return `32:0:${amountSats.toString()}`;
}

export function useOpenTroveMutation() {
  const { execute, primaryAddress, network, ready } = useFrostlendExecute();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: OpenTroveParams) => {
      if (!ready) throw new Error('Wallet/SDK not ready');

      const protostones = buildOpenTroveProtostone({
        debtFrostUsdSats: params.debtFrostUsdSats,
        hintPrev: params.hintPrev ?? 0n,
        hintNext: params.hintNext ?? 0n,
        maxFeePercentage: params.maxFeePercentage ?? MAX_BORROWING_FEE,
      });
      const inputRequirements = buildFrbtcInputRequirements(params.collateralFrbtcSats);

      // Snapshot user's [2,*] receipts BEFORE submitting so we can identify the
      // freshly-spawned trove auth token by diffing post-tx. This is the same
      // receipt-by-passage pattern used in the SP deposit hook.
      //
      // Why not "trove_id = count - 1"? The contract uses TWO counters:
      //   /next_trove_id (starts at 1, monotonic — the assigned id)
      //   /trove_count   (starts at 0, decremented on close — current active count)
      // After CloseTrove + OpenTrove sequences, count != next_id, so the count-based
      // recovery breaks. Diffing wallet receipts is robust: whichever [2,*] just
      // appeared IS the trove auth token (boiler's receipt-by-passage).
      const beforeReceipts = primaryAddress && network
        ? await fetchUserBlock2Receipts(network, primaryAddress)
        : [];
      const beforeTxs = beforeReceipts.map(r => r.tx);

      const { txid } = await execute({
        protostones,
        inputRequirements,
        feeRate: params.feeRate,
      });

      // Identify the new receipt and reverse-look-up its trove_id.
      let troveId: string | null = null;
      let authTokenId: string | null = null;
      try {
        const after = primaryAddress && network
          ? await fetchUserBlock2Receipts(network, primaryAddress)
          : [];
        const newReceiptTx = diffNewReceipt(beforeTxs, after);
        if (newReceiptTx !== null) {
          authTokenId = `2:${newReceiptTx}`;
          // Reverse-look-up: walk trove ids and find the one whose
          // GetTroveAuthToken matches our receipt. Bounded by trove_count.
          const tmTarget = parseAlkaneTarget(FROSTLEND_CONTRACTS.TROVE_MANAGER);
          const countExec = await simulateAlkane(network, tmTarget, ['23']); // GetTroveCount
          const count = parseU128(countExec);
          // /next_trove_id starts at 1, so candidate ids are [1..count*2] to allow
          // for closed troves shifting next_id beyond count. Bounded scan.
          const upperBound = Number(count) * 2 + 5;
          for (let i = 1; i <= upperBound; i++) {
            const authExec = await simulateAlkane(network, tmTarget, ['33', i.toString()]);
            const raw = authExec?.data;
            if (!raw || typeof raw !== 'string') continue;
            const clean = raw.replace(/^0x/, '');
            if (clean.length < 64) continue;
            const txBytes = clean.slice(32, 64);
            const txLe = BigInt('0x' + (txBytes.match(/.{2}/g) || []).reverse().join(''));
            if (txLe === newReceiptTx) {
              troveId = i.toString();
              break;
            }
          }
        }
      } catch {
        // best-effort — UI will fall back to "no trove found" until next refetch
      }

      if (troveId && primaryAddress && network) {
        writeCachedTrove(network, primaryAddress, troveId, authTokenId);
      }

      return { txid, troveId, authTokenId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frostlend'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balances'] });
      queryClient.refetchQueries({ queryKey: ['frostlend'] }).catch(() => {});
    },
  });
}
