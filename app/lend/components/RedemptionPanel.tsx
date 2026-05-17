'use client';

/**
 * Redemption panel — burn frostUSD, receive frBTC at face value (less redemption fee).
 *
 * Bootstrap window: 14 days post-deployment. The contract enforces this; we don't
 * gate the UI here (the tx will revert with a clear error if too early).
 */

import { useState } from 'react';
import { useRedeemMutation } from '@/hooks/frostlend';
import { MAX_BORROWING_FEE } from '@/constants/frostlend';
import { useNotification } from '@/context/NotificationContext';

function frostUsdToSats(usd: string): bigint {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 1e8));
}

export default function RedemptionPanel() {
  const redeem = useRedeemMutation();
  const { showNotification, showError } = useNotification();
  const [amount, setAmount] = useState('500');
  const [maxFee, setMaxFee] = useState('5'); // percent

  const sats = frostUsdToSats(amount);
  const maxFeeBig = BigInt(Math.floor(Number(maxFee) * 1e16)); // 18-dec * 0.01

  return (
    <div className="sf-card p-5">
      <h2 className="mb-3 text-base font-semibold text-zinc-100">Redemption</h2>
      <p className="mb-4 text-xs text-zinc-400">
        Trade frostUSD for frBTC at face value. Walks lowest-ICR troves first.
        Subject to a redemption fee (0.5% floor) + 14-day bootstrap.
      </p>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
          Amount (frostUSD)
        </span>
        <input
          type="text"
          inputMode="decimal"
          className="sf-input w-full"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">
          Max fee (%)
        </span>
        <input
          type="text"
          inputMode="decimal"
          className="sf-input w-full"
          value={maxFee}
          onChange={(e) => setMaxFee(e.target.value)}
        />
      </label>

      <button
        type="button"
        disabled={redeem.isPending || sats === 0n}
        onClick={() =>
          redeem.mutate(
            {
              amountFrostUsdSats: sats,
              maxFeePercentage: maxFeeBig === 0n ? MAX_BORROWING_FEE : maxFeeBig,
              maxIterations: 100n,
              feeRate: 1,
            },
            {
              onSuccess: (data) => { if (data?.txid) showNotification(data.txid, 'lend'); },
              onError: (e) => { showError((e as Error)?.message || 'Redemption failed'); },
            },
          )
        }
        className="mt-3 w-full rounded-md bg-cyan-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-400 disabled:opacity-50"
      >
        {redeem.isPending ? 'Redeeming…' : 'Redeem'}
      </button>
      {redeem.isError && (
        <div className="mt-2 text-xs text-red-300">Error: {(redeem.error as Error)?.message}</div>
      )}
    </div>
  );
}
