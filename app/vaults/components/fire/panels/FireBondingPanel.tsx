'use client';

import { useState, useRef } from 'react';
import { useFireBondingStats } from '@/hooks/fire/useFireBondingStats';
import { useWallet } from '@/context/WalletContext';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

interface FireBondingPanelProps {
  vaultDetailsSlot?: React.ReactNode;
}

export default function FireBondingPanel({ vaultDetailsSlot }: FireBondingPanelProps) {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: bondingStats } = useFireBondingStats();


  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [amountFocused, setAmountFocused] = useState(false);
  const parsedAmount = parseFloat(amount) || 0;

  const discount = new BigNumber(bondingStats?.currentDiscount || '0').dividedBy(10).toFixed(1);
  const firePrice = new BigNumber(bondingStats?.firePrice || '0').dividedBy(1e8).toFixed(8);
  const availableFire = new BigNumber(bondingStats?.availableFire || '0').dividedBy(1e8);
  const discountedPrice = new BigNumber(firePrice).multipliedBy(1 - Number(discount) / 100);
  const fireReceived = parsedAmount > 0
    ? new BigNumber(parsedAmount).dividedBy(discountedPrice.gt(0) ? discountedPrice : 1).toFixed(4)
    : '0';

  const handleBond = () => {
    if (isDemoGated) return;
    console.log('[FireBondingPanel] Bond:', { amount });
  };


  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Bond form */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
            {t('fire.bondLpForFire')}
          </div>

          {/* Discount + price cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-2xl bg-emerald-500/10 p-3 sm:p-4 text-center shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">{t('fire.discount')}</div>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-400">{discount}%</div>
            </div>
            <div className="rounded-2xl bg-[color:var(--sf-surface)]/40 p-3 sm:p-4 text-center shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.firePrice')}</div>
              <div className="text-sm sm:text-base font-bold text-[color:var(--sf-text)] truncate">{firePrice}</div>
              <div className="text-[10px] text-[color:var(--sf-muted)]">frBTC</div>
            </div>
          </div>

          {/* Amount input */}
          <div
            className={`rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[200ms] cursor-text mb-4 ${
              amountFocused
                ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]'
                : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'
            }`}
            onClick={() => amountRef.current?.focus()}
          >
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('fire.lpAmount')}</span>
            <div className="flex items-center gap-2 mt-1">
              <input
                ref={amountRef}
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onFocus={() => setAmountFocused(true)}
                onBlur={() => setAmountFocused(false)}
                placeholder="0.00"
                className="w-full bg-transparent text-2xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/30 !outline-none !ring-0 !border-none focus:!outline-none focus:!ring-0 focus:!border-none focus-visible:!outline-none focus-visible:!ring-0"
                style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
              />
              <span className="text-sm font-bold text-[color:var(--sf-muted)] flex-shrink-0">LP</span>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] p-3 sm:p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[color:var(--sf-muted)]">{t('fire.youReceiveVested')}</span>
              <span className="font-bold text-orange-400">{fireReceived} FIRE</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[color:var(--sf-muted)]">{t('fire.vestingPeriod')}</span>
              <span className="text-[color:var(--sf-text)]/70">~5 days (720 blocks)</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[color:var(--sf-muted)]">{t('fire.availableFire')}</span>
              <span className="text-[color:var(--sf-text)]/70">{availableFire.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleBond}
            disabled={!isConnected || parsedAmount <= 0 || isDemoGated}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)]"
          >
            {isDemoGated ? t('common.comingSoon') : !isConnected ? t('fire.connectWallet') : t('fire.bondLp')}
          </button>
        </div>
      </div>

      {vaultDetailsSlot}

      {/* Active bonds */}
      <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)] flex flex-col opacity-50 pointer-events-none">
        {/* Header */}
        <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40 flex-shrink-0">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('fire.activeBonds')} (demo)</h3>
        </div>

        {!isConnected ? (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
            {t('fire.connectToViewBonds')}
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-4 gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 border-b border-[color:var(--sf-row-border)]">
              <div>LP Bonded</div>
              <div>FIRE Vesting</div>
              <div>Remaining</div>
              <div className="text-right">Bond Date</div>
            </div>

            {/* Rows */}
            <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(5 * 85px)' }}>
              {[
                { lpBonded: '5', fireVesting: '25', bondDate: '03/16/2026', remaining: '3d 21h 59m' },
              ].map((row, i) => (
                <div
                  key={i}
                  className="grid grid-cols-4 items-center gap-2 px-6 py-4 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-row-border)]"
                >
                  <div className="text-sm font-bold text-[color:var(--sf-primary)]">{row.lpBonded}</div>
                  <div className="text-sm font-bold text-orange-500">{row.fireVesting}</div>
                  <div className="text-sm font-bold text-[color:var(--sf-primary)]">{row.remaining}</div>
                  <div className="text-sm text-[color:var(--sf-primary)] text-right">{row.bondDate}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
