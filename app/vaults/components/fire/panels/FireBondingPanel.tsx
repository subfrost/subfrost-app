'use client';

import { useState } from 'react';
import BondCard from '../widgets/BondCard';
import { useFireBondingStats } from '@/hooks/fire/useFireBondingStats';
import { useFireUserBonds } from '@/hooks/fire/useFireUserBonds';
import { useWallet } from '@/context/WalletContext';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

export default function FireBondingPanel() {
  const { t } = useTranslation();
  const { isConnected } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: bondingStats } = useFireBondingStats();
  const { data: userBonds } = useFireUserBonds();

  const [amount, setAmount] = useState('');
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

  const handleClaimVested = (bondId: number) => {
    if (isDemoGated) return;
    console.log('[FireBondingPanel] Claim:', { bondId });
  };

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Bond form */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl p-4 sm:p-5 shadow-[0_4px_20px_rgba(0,0,0,0.12)] bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
            {t('fire.bondLpForFire')}
          </div>

          {/* Discount + price cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 sm:p-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">{t('fire.discount')}</div>
              <div className="text-2xl sm:text-3xl font-bold text-emerald-400">{discount}%</div>
            </div>
            <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] p-3 sm:p-4 text-center">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.firePrice')}</div>
              <div className="text-sm sm:text-base font-bold text-[color:var(--sf-text)] truncate">{firePrice}</div>
              <div className="text-[10px] text-[color:var(--sf-muted)]">frBTC</div>
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-1.5 block">{t('fire.lpAmount')}</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full rounded-xl bg-[color:var(--sf-surface)] px-4 py-3.5 text-lg font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/30 outline-none border border-[color:var(--sf-glass-border)] focus:border-orange-500/50 transition-colors"
            />
          </div>

          {/* Preview */}
          <div className="rounded-xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] p-3 sm:p-4 mb-4 space-y-2">
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

      {/* Active bonds */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">
          {t('fire.activeBonds')}
        </div>

        {!isConnected ? (
          <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-8 sm:p-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <div className="text-[color:var(--sf-muted)] text-sm">{t('fire.connectToViewBonds')}</div>
          </div>
        ) : !userBonds?.bonds?.length ? (
          <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-8 sm:p-12 text-center shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <div className="text-2xl mb-2">
              <svg className="h-8 w-8 mx-auto text-[color:var(--sf-muted)]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
              </svg>
            </div>
            <div className="text-[color:var(--sf-muted)] text-sm">{t('fire.noBonds')}</div>
          </div>
        ) : (
          userBonds.bonds.map((bond) => (
            <BondCard
              key={bond.bondId}
              bondId={bond.bondId}
              lpAmount={bond.lpAmount}
              fireAmount={bond.fireAmount}
              vestStart={bond.vestStart}
              vestEnd={bond.vestEnd}
              claimed={bond.claimed}
              onClaim={handleClaimVested}
              disabled={isDemoGated}
            />
          ))
        )}
      </div>
    </div>
  );
}
