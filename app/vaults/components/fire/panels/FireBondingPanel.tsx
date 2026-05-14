'use client';

import { useState, useRef } from 'react';
import { useFireBondingStats } from '@/hooks/fire/useFireBondingStats';
import { useWallet } from '@/context/WalletContext';
import { useVaultDemoGate } from '@/hooks/useVaultDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

interface FireBondingPanelProps {
  vaultDetailsSlot?: React.ReactNode;
}

export default function FireBondingPanel({ vaultDetailsSlot }: FireBondingPanelProps) {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const isDemoGated = useVaultDemoGate();
  const { data: bondingStats } = useFireBondingStats();


  const amountRef = useRef<HTMLInputElement>(null);
  const [amount, setAmount] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
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
        <div className="sf-card p-4 sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
            {t('fire.bondLpForFire')}
          </div>

          {/* Amount input */}
          <div className="mb-3">
            <div className="relative sf-input group p-4 cursor-text" onClick={() => amountRef.current?.focus()}>
              <div className="absolute right-4 top-4 z-10">
                <div className="inline-flex items-center rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                  <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">LP</span>
                </div>
              </div>
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('fire.bondLpTokens')}</span>
              <div className="flex items-center gap-2 mt-1 pr-20">
                <input
                  ref={amountRef}
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  className="w-full bg-transparent text-2xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/30 !outline-none !ring-0 !border-none focus:!outline-none focus:!ring-0 focus:!border-none focus-visible:!outline-none focus-visible:!ring-0"
                  style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
                />
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                  {t('boost.balance', { amount: '0.00' })}
                </div>
                <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${inputFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat('0.00') * 0.25).toString())}
                    className="sf-percent-btn-pill"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat('0.00') * 0.5).toString())}
                    className="sf-percent-btn-pill"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat('0.00') * 0.75).toString())}
                    className="sf-percent-btn-pill"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount('0.00')}
                    className="sf-percent-btn-pill"
                  >
                    {t('boost.max')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Discount */}
          <div className="rounded-2xl bg-[color:var(--sf-info-green-bg)] flex flex-col items-center justify-center text-center py-3 mb-4">
            <div className="text-2xl font-bold text-[color:var(--sf-info-green-title)]">{discount}%</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-info-green-title)]">{t('fire.discount')}</div>
          </div>

          {/* Preview */}
          <div className="sf-panel p-3 sm:p-4 mb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[color:var(--sf-muted)]">{t('fire.youReceiveVested')}</span>
              <span className="font-bold text-orange-400">{fireReceived} FIRE</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[color:var(--sf-muted)]">{t('fire.vestingPeriod')}</span>
              <span className="text-[color:var(--sf-text)]/70">{t('fire.vestingDuration')}</span>
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
      <div className="sf-card overflow-hidden flex flex-col opacity-50 pointer-events-none">
        <div className="sf-card-header">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('fire.activeBonds')} (demo)</h3>
        </div>

        {!isConnected ? (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
            {t('fire.connectToViewBonds')}
          </div>
        ) : (
          <>
            <div className="sf-table-header grid grid-cols-4 gap-2 px-6">
              <div>{t('fire.lpBonded')}</div>
              <div>{t('fire.fireVesting')}</div>
              <div>{t('fire.remaining')}</div>
              <div className="text-right">{t('fire.bondDate')}</div>
            </div>

            <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(5 * 85px)' }}>
              {[
                { lpBonded: '5', fireVesting: '25', bondDate: '03/16/2026', remaining: '3d 21h 59m' },
              ].map((row, i) => (
                <div key={i} className="sf-row grid grid-cols-4 items-center gap-2 px-6 py-4">
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
