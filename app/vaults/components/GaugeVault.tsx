"use client";

import { useState } from "react";
import VaultActionPanel from "./VaultActionPanel";
import { useTranslation } from '@/hooks/useTranslation';

export default function GaugeVault() {
  const [mode, setMode] = useState<'stake' | 'unstake'>('stake');
  const [amount, setAmount] = useState<string>("");
  const [infoTab, setInfoTab] = useState<'about' | 'boost' | 'info' | 'risk'>('about');
  const { t } = useTranslation();

  // Mock data
  const stats = {
    tvl: "450,200.00",
    baseApy: "12.5",
    boostedApy: "28.2",
    userStaked: "0.00",
    userBoost: "1.0",
    pendingRewards: "12.50",
  };

  const handleExecute = () => {
    console.log(`${mode}:`, amount);
    // TODO: Implement gauge interaction
  };

  const handleClaim = () => {
    console.log("Claim gauge rewards");
    // TODO: Implement claim logic
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {/* Main Info */}
      <div className="md:col-span-2 space-y-6">
        {/* Gauge Header */}
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">{t('gauge.title')}</h2>
              <p className="mt-2 text-sm text-[color:var(--sf-text-secondary)]">
                {t('gauge.description')}
              </p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-500">
              <span className="text-2xl">⚡</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-4 backdrop-blur-sm">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('gauge.tvl')}</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)]">${stats.tvl}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-4 backdrop-blur-sm">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('gauge.baseApr')}</div>
            <div className="text-2xl font-bold text-green-600">{stats.baseApy}%</div>
          </div>
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-4 backdrop-blur-sm">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('gauge.yourBoost')}</div>
            <div className="text-2xl font-bold text-purple-600">{stats.userBoost}x</div>
          </div>
          <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-4 backdrop-blur-sm">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('gauge.boostedApr')}</div>
            <div className="text-2xl font-bold text-blue-600">{stats.boostedApy}%</div>
          </div>
        </div>

        {/* Info Tabs Section */}
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm">
          <div className="flex gap-6 mb-6 border-b border-[color:var(--sf-outline)]">
            {['about', 'boost', 'info', 'risk'].map((tab) => (
              <button
                key={tab}
                onClick={() => setInfoTab(tab as any)}
                className={`pb-3 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  infoTab === tab
                    ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                    : 'text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]'
                }`}
              >
                {tab === 'about' ? t('vaultInfo.about') : tab === 'boost' ? t('gauge.boostMechanics') : tab === 'info' ? t('vaultInfo.info') : t('vaultInfo.risk')}
              </button>
            ))}
          </div>

          {infoTab === 'about' && (
            <div className="space-y-4">
              <p className="text-sm text-[color:var(--sf-text)]">
                {t('gauge.aboutDesc')}
              </p>
              <div className="space-y-2">
                {[t('gauge.feature1'), t('gauge.feature2'), t('gauge.feature3'), t('gauge.feature4'), t('gauge.feature5')].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-[color:var(--sf-text)]">
                    <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          )}

          {infoTab === 'boost' && (
            <div className="space-y-4">
              <h4 className="font-semibold text-[color:var(--sf-text)]">{t('gauge.boostMechanics')}</h4>
              <div className="space-y-3">
                <div className="rounded-lg bg-purple-50 border border-purple-200 p-3">
                  <div className="font-semibold text-sm text-purple-900 mb-2">{t('gauge.boostFormula')}</div>
                  <span className="text-xs text-purple-800 bg-[color:var(--sf-surface)] px-2 py-1 rounded block">
                    boost = min(1 + (FIRE × total_stake) / (stake × total_FIRE), 2.5)
                  </span>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-text)] mb-1">{t('gauge.exampleCalculation')}</div>
                  <div className="text-xs text-[color:var(--sf-text)]">
                    User: 100 LP staked, 50 FIRE held<br/>
                    Pool: 1000 LP total, 200 FIRE total<br/><br/>
                    boost = min(1 + (50 × 1000) / (100 × 200), 2.5)<br/>
                    = min(1 + 50000 / 20000, 2.5)<br/>
                    = min(1 + 2.5, 2.5)<br/>
                    = <strong className="text-purple-600">2.5x maximum boost!</strong>
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="font-semibold text-sm text-blue-900 mb-1">{t('gauge.howToMaximize')}</div>
                  <div className="text-xs text-blue-800">
                    1. Lock more DIESEL in yFIRE vault<br/>
                    2. Maintain high FIRE / LP ratio<br/>
                    3. Monitor boost multiplier regularly
                  </div>
                </div>
              </div>
            </div>
          )}

          {infoTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('gauge.contractType')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{t('gauge.gaugeStaking')}</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('gauge.inputAsset')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{t('gauge.lpTokens')}</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('gauge.outputTokens')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{t('gauge.gaugeTokens')}</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('gauge.rewardToken')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">DIESEL [2:0]</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('gauge.maxBoost')}</div>
                  <div className="font-semibold text-purple-600">2.5x</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('gauge.timelock')}</div>
                  <div className="font-semibold text-green-600">{t('gauge.none')}</div>
                </div>
              </div>
              <div className="pt-3 border-t border-[color:var(--sf-outline)]">
                <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('gauge.gaugeContractAddress')}</div>
                <div className="text-xs text-[color:var(--sf-text)] bg-gray-50 p-2 rounded">
                  AlkaneId &#123; block: 2, tx: &lt;deployed_tx&gt; &#125;
                </div>
              </div>
            </div>
          )}

          {infoTab === 'risk' && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--sf-text)]">
                {t('gauge.riskIntro')}
              </p>
              <div className="space-y-2">
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                  <div className="font-semibold text-sm text-yellow-900 mb-1">{t('gauge.smartContractRisk')}</div>
                  <div className="text-xs text-yellow-800">
                    {t('gauge.smartContractDesc')}
                  </div>
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                  <div className="font-semibold text-sm text-orange-900 mb-1">{t('gauge.boostCompetition')}</div>
                  <div className="text-xs text-orange-800">
                    {t('gauge.boostCompetitionDesc')}
                  </div>
                </div>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                  <div className="font-semibold text-sm text-blue-900 mb-1">{t('gauge.rewardVariability')}</div>
                  <div className="text-xs text-blue-800">
                    {t('gauge.rewardVariabilityDesc')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Panel */}
      <div className="md:col-span-1">
        <VaultActionPanel
          mode={mode}
          onModeChange={setMode}
          amount={amount}
          onAmountChange={setAmount}
          onExecute={handleExecute}
          onClaim={handleClaim}
          balance={mode === 'stake' ? "0.00" : stats.userStaked}
          pendingRewards={stats.pendingRewards}
          inputToken="LP"
          outputToken="Gauge"
          title={t('gauge.manageStake')}
        />
      </div>
    </div>
  );
}
