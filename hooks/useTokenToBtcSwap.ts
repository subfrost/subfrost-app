/**
 * useTokenToBtcSwap — sequential Token → frBTC + Unwrap flow.
 *
 * Two separate transactions (chained, NOT atomic):
 *   1. Swap Token → frBTC via factory router
 *   2. Wait for swap confirmation
 *   3. Unwrap frBTC → BTC
 *
 * Why two-tx instead of atomic: the previous atomic three-protostone path
 * had slippage uncertainty between swap and unwrap, plus complex PSBT
 * signing. Two-tx is simpler and lets the user partially recover (swap
 * succeeded, unwrap failed → user has frBTC, can retry unwrap).
 *
 * Why a hook: the UI shouldn't own confirmation polling, devnet-specific
 * mining, or the cross-tx state transitions (swapping →
 * swap-confirming → unwrapping → complete). Caller passes `onProgress`
 * + `onNotify` callbacks to drive its UI.
 */
'use client';

import { useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useSwapMutation } from '@/hooks/useSwapMutation';
import { useUnwrapMutation } from '@/hooks/useUnwrapMutation';
import { useFeeRate } from '@/hooks/useFeeRate';
import { useGlobalStore } from '@/stores/global';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { getEsploraTx } from '@/lib/alkanes/rpc';
import type { OperationType } from '@/app/components/SwapSuccessNotification';

export interface TokenToBtcSwapProgress {
  type: 'swapping' | 'swap-confirming' | 'unwrapping' | 'complete' | 'error';
  txId?: string;
  attempt?: number;
  maxAttempts?: number;
  swapTxId?: string;
  unwrapTxId?: string;
  step?: 'swap' | 'unwrap';
  message?: string;
}

export interface TokenToBtcSwapParams {
  /** Sell token alkane id (e.g. "2:0" for DIESEL). */
  fromTokenId: string;
  /** Sell amount in raw sub-units (1e8). */
  sellAmount: string;
  /** Quote-derived expected buy amount of frBTC. */
  buyAmount: string;
  /** Pool id from the swap quote. */
  poolId?: { block: string | number; tx: string | number };
  /** UI callback fired on every state transition. */
  onProgress: (progress: TokenToBtcSwapProgress) => void;
  /** UI callback fired when a tx is broadcast (for toast notifications). */
  onNotify: (txId: string, operation: OperationType, stepContext?: string) => void;
}

export function useTokenToBtcSwap() {
  const { network, address } = useWallet();
  const { maxSlippage, deadlineBlocks } = useGlobalStore();
  const fee = useFeeRate();
  const swapMutation = useSwapMutation();
  const unwrapMutation = useUnwrapMutation();
  const config = getConfig(network);

  const executeTokenToBtcSwap = useCallback(
    async (params: TokenToBtcSwapParams): Promise<{ swapTxId: string; unwrapTxId: string }> => {
      const isRegtest = ['regtest', 'subfrost-regtest', 'oylnet', 'regtest-local', 'devnet'].includes(network);

      // ---------------------------------------------------------------------
      // Step 1 — Token → frBTC swap
      // ---------------------------------------------------------------------
      params.onProgress({ type: 'swapping' });

      const swapRes = await swapMutation.mutateAsync({
        sellCurrency: params.fromTokenId,
        buyCurrency: config.FRBTC_ALKANE_ID,
        direction: 'sell',
        sellAmount: params.sellAmount,
        buyAmount: params.buyAmount,
        maxSlippage,
        feeRate: fee.feeRate,
        poolId: params.poolId,
        deadlineBlocks,
      });

      if (!swapRes?.success || !swapRes.transactionId) {
        params.onProgress({ type: 'error', step: 'swap', message: 'No transaction ID returned' });
        throw new Error('Swap step failed — no transaction ID returned');
      }
      const swapTxId = swapRes.transactionId;

      // Devnet/regtest: mine a block to confirm the swap tx so the unwrap
      // step can see the frBTC UTXO. JOURNAL (2026-03-26): without this,
      // unwrap reads stale state and fails with "insufficient alkanes".
      if (isRegtest && address) {
        try {
          if (network === 'devnet') {
            await fetch(getRpcUrl(network), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'generatetoaddress', params: [1, address], id: 1 }),
            });
          } else {
            await fetch('/api/regtest/mine', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ blocks: 1, address }),
            });
          }
        } catch (mineErr) {
          console.warn('[useTokenToBtcSwap] Mine failed (non-fatal):', mineErr);
        }
      }

      // ---------------------------------------------------------------------
      // Mainnet: poll esplora_tx until swap is confirmed (max ~30 min @ 15s
      // intervals). Devnet just waits 500ms — the manual mine above already
      // confirmed it.
      // ---------------------------------------------------------------------
      if (network !== 'devnet') {
        params.onNotify(swapTxId, 'swap', 'Step 1/2');

        const pollInterval = isRegtest ? 1500 : 15000;
        const maxPollAttempts = isRegtest ? 20 : 120;
        let swapConfirmed = false;

        for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
          params.onProgress({ type: 'swap-confirming', txId: swapTxId, attempt: attempt + 1, maxAttempts: maxPollAttempts });
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          try {
            const tx = await getEsploraTx(network!, swapTxId);
            if (tx?.status?.confirmed) {
              await new Promise(resolve => setTimeout(resolve, 2000));
              swapConfirmed = true;
              break;
            }
          } catch {
            // polling RPC error — keep retrying
          }
        }

        if (!swapConfirmed) {
          params.onProgress({ type: 'error', step: 'swap', message: 'Swap tx did not confirm', swapTxId });
          throw new Error('Swap tx did not confirm — unwrap frBTC → BTC manually.');
        }
      } else {
        params.onNotify(swapTxId, 'swap', 'Step 1/2');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // ---------------------------------------------------------------------
      // Step 2 — Unwrap frBTC → BTC
      // ---------------------------------------------------------------------
      params.onProgress({ type: 'unwrapping' });

      // Devnet workaround: quote.buyAmount can be wildly wrong because pool
      // reserves don't match the quote engine's expectations. Query actual
      // frBTC balance via the enriched-balances Lua script which reads the
      // alkanes indexer directly.
      let frbtcAmount = params.buyAmount;
      if (network === 'devnet' && address) {
        try {
          const resp = await fetch(getRpcUrl(network), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'lua_evalsaved',
              params: ['4efbe0cdfe14270cb72eec80bce63e44f9f926951a67a0ad7256fca39046b80f', address, '1'],
            }),
          });
          const data = await resp.json();
          const assets = data?.result?.returns?.assets || [];
          let totalFrbtc = 0n;
          for (const asset of assets) {
            for (const r of (asset?.runes || [])) {
              if (r.block === 32 && r.tx === 0) totalFrbtc += BigInt(r.amount || 0);
            }
          }
          if (totalFrbtc > 0n) {
            // unwrapMutation.amount expects display units; convert from raw 1e8.
            frbtcAmount = (Number(totalFrbtc) / 1e8).toFixed(8);
          }
        } catch (err) {
          console.warn('[useTokenToBtcSwap] Devnet: could not query frBTC balance, using quote:', err);
        }
      }

      const unwrapRes = await unwrapMutation.mutateAsync({
        amount: frbtcAmount,
        feeRate: fee.feeRate,
      });

      if (!unwrapRes?.success || !unwrapRes.transactionId) {
        params.onProgress({ type: 'error', step: 'unwrap', message: 'No transaction ID returned', swapTxId });
        throw new Error('Unwrap step failed — no transaction ID returned');
      }

      // Devnet: mine a block to confirm the unwrap so BTC balance updates.
      if (network === 'devnet' && address) {
        try {
          await fetch(getRpcUrl(network), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'generatetoaddress', params: [1, address], id: 1 }),
          });
        } catch {
          // Mining is best-effort; balance will catch up on next poll.
        }
      }

      params.onProgress({ type: 'complete', swapTxId, unwrapTxId: unwrapRes.transactionId });
      params.onNotify(unwrapRes.transactionId, 'unwrap', 'Step 2/2');

      return { swapTxId, unwrapTxId: unwrapRes.transactionId };
    },
    [network, address, maxSlippage, deadlineBlocks, fee.feeRate, swapMutation, unwrapMutation, config.FRBTC_ALKANE_ID],
  );

  return {
    executeTokenToBtcSwap,
    isPending: swapMutation.isPending || unwrapMutation.isPending,
  };
}
