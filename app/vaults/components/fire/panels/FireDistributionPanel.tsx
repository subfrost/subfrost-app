'use client';

import { useState, useRef } from 'react';
import { useFireDistributor } from '@/hooks/fire/useFireDistributor';
import { useWallet } from '@/context/WalletContext';
import TokenIcon from '@/app/components/TokenIcon';
import { useDemoGate } from '@/hooks/useDemoGate';
import { useTranslation } from '@/hooks/useTranslation';
import BigNumber from 'bignumber.js';

const PHASE_KEYS = [
  { name: 'fire.contribution', description: 'fire.contributionDesc' },
  { name: 'fire.snapshot', description: 'fire.snapshotDesc' },
  { name: 'fire.claimPhase', description: 'fire.claimPhaseDesc' },
  { name: 'fire.complete', description: 'fire.completeDesc' },
];

export default function FireDistributionPanel() {
  const { t } = useTranslation();
  const { isConnected, network } = useWallet();
  const isDemoGated = useDemoGate();
  const { data: distributor } = useFireDistributor();

  const contributeRef = useRef<HTMLInputElement>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  const currentPhase = Number(distributor?.phase || '0');
  const totalContributed = new BigNumber(distributor?.totalContributed || '0').dividedBy(1e8);
  const totalClaimed = new BigNumber(distributor?.totalClaimed || '0').dividedBy(1e8);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Action area */}
      <div className="sf-card p-4 sm:p-5">
        {currentPhase === 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
              {t('fire.contributeFrbtc')}
            </div>
            <div className="relative sf-input group p-4 cursor-text mb-4" onClick={() => contributeRef.current?.focus()}>
              <div className="absolute right-4 top-4 z-10">
                <div className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                  <TokenIcon symbol="frBTC" size="sm" network={network} />
                  <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">frBTC</span>
                </div>
              </div>
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('fire.amount')}</span>
              <div className="flex items-center gap-2 mt-1 pr-32">
                <input
                  ref={contributeRef}
                  type="number"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
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
                    onClick={() => setContributeAmount((parseFloat('0.00') * 0.25).toString())}
                    className="sf-percent-btn-pill"
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setContributeAmount((parseFloat('0.00') * 0.5).toString())}
                    className="sf-percent-btn-pill"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setContributeAmount((parseFloat('0.00') * 0.75).toString())}
                    className="sf-percent-btn-pill"
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setContributeAmount('0.00')}
                    className="sf-percent-btn-pill"
                  >
                    {t('boost.max')}
                  </button>
                </div>
              </div>
            </div>
            <button
              disabled={!isConnected || isDemoGated}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)]"
            >
              {isDemoGated ? t('common.comingSoon') : !isConnected ? t('fire.connectWallet') : t('fire.contribute')}
            </button>
          </div>
        )}

        {currentPhase === 1 && (
          <div className="text-center py-8 sm:py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-3">
              <svg className="h-6 w-6 text-amber-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">{t('fire.snapshotInProgress')}</div>
            <div className="text-sm text-[color:var(--sf-muted)] mt-2 max-w-xs mx-auto">
              {t('fire.snapshotDesc2')}
            </div>
          </div>
        )}

        {currentPhase === 2 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
              {t('fire.claimFire')}
            </div>
            <button
              disabled={!isConnected || isDemoGated}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none bg-gradient-to-r from-orange-500 to-orange-600 hover:shadow-[0_4px_16px_rgba(249,115,22,0.3)]"
            >
              {isDemoGated ? t('common.comingSoon') : !isConnected ? t('fire.connectWallet') : t('fire.claimFire')}
            </button>
          </div>
        )}

        {currentPhase >= 3 && (
          <div className="text-center py-8 sm:py-12">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-3">
              <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-lg font-bold text-emerald-400">{t('fire.distributionComplete')}</div>
            <div className="text-sm text-[color:var(--sf-muted)] mt-2">
              {t('fire.distributionCompleteDesc')}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="sf-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.totalContributed')}</div>
          <div className="text-lg sm:text-xl font-bold text-[color:var(--sf-text)] mt-1">{totalContributed.toFixed(4)}</div>
          <div className="text-[10px] text-[color:var(--sf-muted)]">frBTC</div>
        </div>
        <div className="sf-card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--sf-muted)]">{t('fire.totalClaimed')}</div>
          <div className="text-lg sm:text-xl font-bold text-[color:var(--sf-text)] mt-1">{totalClaimed.toFixed(4)}</div>
          <div className="text-[10px] text-[color:var(--sf-muted)]">FIRE</div>
        </div>
      </div>

      {/* Phase indicator */}
      <div className="sf-card p-4 sm:p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-muted)] mb-4">
          {t('fire.distributionPhase')}
        </div>

        {/* Phase progress */}
        <div className="flex items-start gap-1 sm:gap-2 mb-5">
          {PHASE_KEYS.map((phase, i) => (
            <div key={i} className="flex-1 min-w-0">
              <div className={`h-1.5 sm:h-2 rounded-full transition-colors duration-500 ${
                i < currentPhase
                  ? 'bg-emerald-400'
                  : i === currentPhase
                    ? 'bg-gradient-to-r from-orange-500 to-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.4)]'
                    : 'bg-[color:var(--sf-panel-bg)]'
              }`} />
              <div className={`text-[9px] sm:text-[10px] mt-1.5 font-semibold uppercase tracking-wider truncate ${
                i === currentPhase
                  ? 'text-orange-400'
                  : i < currentPhase
                    ? 'text-emerald-400/70'
                    : 'text-[color:var(--sf-muted)]/40'
              }`}>
                {t(phase.name)}
              </div>
            </div>
          ))}
        </div>

        {/* Current phase info */}
        <div className="sf-panel p-3 sm:p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[color:var(--sf-muted)]">{t('fire.phase')} {currentPhase}: {t(PHASE_KEYS[currentPhase]?.name || 'fire.unknown')}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-[color:var(--sf-muted)]">{PHASE_KEYS[currentPhase]?.description ? t(PHASE_KEYS[currentPhase].description) : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
