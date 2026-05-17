'use client';

/**
 * Stability Pool panel — deposit frostUSD to absorb liquidations, earn frBTC gains.
 *
 * v1: simple deposit / withdraw form. Future: show user's compounded deposit and
 * frBTC gain via opcodes 21 (GetCompoundedDeposit) / 22 (GetDepositorFrbtcGain),
 * once we have a way to recover depositor_id from the tx receipt.
 */

import { useEffect, useState } from 'react';
import {
  useSpDepositMutation,
  useSpWithdrawMutation,
  useSpDepositData,
  fetchSpTotalDeposits,
} from '@/hooks/frostlend';
import { useWallet } from '@/context/WalletContext';
import { useNotification } from '@/context/NotificationContext';
import { frbtcSatsToBtc, frostUsdToFloat } from '@/constants/frostlend';

function frostUsdToSats(usd: string): bigint {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 1e8));
}

export default function StabilityPoolPanel() {
  const { network } = useWallet();
  const { showNotification, showError } = useNotification();
  const deposit = useSpDepositMutation();
  const withdraw = useSpWithdrawMutation();
  const { data: myDeposit } = useSpDepositData();
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState('100');
  const [totalDeposits, setTotalDeposits] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!network) return;
    fetchSpTotalDeposits(network)
      .then(t => { if (!cancelled) setTotalDeposits(t); })
      .catch(() => { if (!cancelled) setTotalDeposits(null); });
    return () => { cancelled = true; };
  }, [network, deposit.isSuccess, withdraw.isSuccess]);

  const submitting = deposit.isPending || withdraw.isPending;
  const lastError = deposit.error || withdraw.error;

  const onSuccess = (data: { txid: string } | undefined) => {
    if (data?.txid) showNotification(data.txid, 'lend');
  };
  const onError = (e: unknown) => {
    showError((e as Error)?.message || 'Transaction failed');
  };

  const submit = () => {
    const sats = frostUsdToSats(amount);
    if (tab === 'deposit') deposit.mutate({ amountFrostUsdSats: sats, feeRate: 1 }, { onSuccess, onError });
    else withdraw.mutate({ amountFrostUsdSats: sats, feeRate: 1 }, { onSuccess, onError });
  };

  return (
    <div className="sf-card p-5">
      <h2 className="mb-3 text-base font-semibold text-zinc-100">Stability Pool</h2>
      <p className="mb-4 text-xs text-zinc-400">
        Deposit frostUSD to absorb liquidations. Receive proportional frBTC gains
        when undercollateralized troves are liquidated.
      </p>

      <div className="mb-3 rounded-md border border-zinc-800/50 px-3 py-2 text-xs text-zinc-400 space-y-1">
        <div>
          Total pool deposits:{' '}
          <span className="text-zinc-200">
            {totalDeposits === null ? '—' : `${frostUsdToFloat(totalDeposits).toFixed(2)} frostUSD`}
          </span>
        </div>
        {myDeposit && (
          <>
            <div>
              Your deposit:{' '}
              <span className="text-zinc-200">
                {frostUsdToFloat(myDeposit.compoundedDeposit).toFixed(2)} frostUSD
              </span>
              <span className="ml-2 text-[10px] text-zinc-500">#{myDeposit.depositorId}</span>
            </div>
            <div>
              Pending frBTC gains:{' '}
              <span className="text-zinc-200">
                {frbtcSatsToBtc(myDeposit.frbtcGain).toFixed(6)} frBTC
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mb-3 flex gap-1 border-b border-zinc-800/50">
        {(['deposit', 'withdraw'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs ${
              tab === t ? 'border-b-2 border-cyan-400 text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t === 'deposit' ? 'Deposit' : 'Withdraw'}
          </button>
        ))}
      </div>

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

      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="mt-3 w-full rounded-md bg-cyan-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-cyan-400 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : tab === 'deposit' ? 'Deposit to SP' : 'Withdraw from SP'}
      </button>
      {lastError && (
        <div className="mt-2 text-xs text-red-300">Error: {(lastError as Error)?.message}</div>
      )}
    </div>
  );
}
