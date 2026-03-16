"use client";

import { useState, useEffect } from "react";
import VaultHero from "./VaultHero";
import VaultDepositInterface from "./VaultDepositInterface";
import VaultListItem from "./VaultListItem";
import { VaultConfig } from "../constants";
import { useVaultStats } from "@/hooks/useVaultStats";
import { useVaultDeposit } from "@/hooks/useVaultDeposit";
import { useVaultWithdraw } from "@/hooks/useVaultWithdraw";
import { useVaultUnits } from "@/hooks/useVaultUnits";
import BoostSection from "./BoostSection";
import { useTranslation } from '@/hooks/useTranslation';

type Props = {
  vault: VaultConfig;
};

export default function VaultDetail({ vault: initialVault }: Props) {
  const [mode, setMode] = useState<'deposit' | 'withdraw' | 'boost'>('deposit');
  const [infoTab, setInfoTab] = useState<'about' | 'strategies' | 'info' | 'risk'>('about');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [currentVault, setCurrentVault] = useState<VaultConfig>(initialVault);
  const { t } = useTranslation();

  // Update current vault when initial vault changes (from parent)
  useEffect(() => {
    setCurrentVault(initialVault);
  }, [initialVault]);

  // Fetch real vault stats
  const { data: vaultStats, isLoading: isLoadingStats } = useVaultStats(
    currentVault.contractAddress,
    currentVault.tokenId
  );
  
  // Fetch user's vault units (for withdraw)
  const { data: vaultUnits, isLoading: isLoadingUnits } = useVaultUnits(currentVault.tokenId);
  
  // Vault mutation hooks
  const depositMutation = useVaultDeposit();
  const withdrawMutation = useVaultWithdraw();

  const stats = {
    tvl: vaultStats?.tvlFormatted || "0.00",
    apy: currentVault.estimatedApy || vaultStats?.apy || "0.00",
    userBalance: vaultStats?.userBalanceFormatted || "0.00",
  };

  const handleVaultChange = (newVault: VaultConfig) => {
    setCurrentVault(newVault);
    // Reset selected unit when switching vaults
    setSelectedUnitId('');
  };

  const handleExecute = async (amount: string) => {
    const feeRate = 10; // Default fee rate, TODO: fetch from fee estimator
    
    if (mode === 'deposit') {
      try {
        const result = await depositMutation.mutateAsync({
          vaultContractId: currentVault.contractAddress,
          tokenId: currentVault.tokenId,
          amount,
          feeRate,
        });
        console.log('Deposit successful:', result.transactionId);
        // TODO: Show success toast
      } catch (error) {
        console.error('Deposit failed:', error);
        // TODO: Show error toast
      }
    } else {
      // Withdraw mode
      if (!selectedUnitId) {
        console.error('No vault unit selected');
        // TODO: Show error toast
        return;
      }
      
      try {
        const result = await withdrawMutation.mutateAsync({
          vaultContractId: currentVault.contractAddress,
          vaultUnitId: selectedUnitId,
          amount: '1', // Vault units are typically 1 per deposit
          feeRate,
        });
        console.log('Withdraw successful:', result.transactionId);
        // TODO: Show success toast
        setSelectedUnitId(''); // Reset selection
      } catch (error) {
        console.error('Withdraw failed:', error);
        // TODO: Show error toast
      }
    }
  };

  const isDxBtc = currentVault.id === 'dx-btc';

  const infoTabsPanel = (
    <div className="rounded-xl bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm h-fit border-t border-[color:var(--sf-top-highlight)]">
      <div className="flex gap-6 mb-6 border-b border-[color:var(--sf-outline)]">
        {['about', 'strategies', 'info', 'risk'].map((tab) => (
          <button
            key={tab}
            onClick={() => setInfoTab(tab as any)}
            className={`pb-3 text-sm font-semibold capitalize transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
              infoTab === tab
                ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                : 'text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]'
            }`}
          >
            {t(`vaultInfo.${tab}`)}
          </button>
        ))}
      </div>

      {infoTab === 'about' && (
        <div className="space-y-4">
          <p className="text-sm text-[color:var(--sf-text)]">
            {t('vaultInfo.aboutDesc', { input: currentVault.inputAsset, output: currentVault.outputAsset })}
          </p>
          <div className="space-y-2">
            {[t('vaultInfo.feature1'), t('vaultInfo.feature2'), t('vaultInfo.feature3'), t('vaultInfo.feature4'), t('vaultInfo.feature5')].map((feature, i) => (
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

      {infoTab === 'strategies' && (
        <div className="space-y-3">
          <h4 className="font-semibold text-[color:var(--sf-text)]">{t('vaultInfo.activeStrategies')}</h4>
          <div className="space-y-2">
            <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
              <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">{t('vaultInfo.lpFeeHarvesting')}</div>
              <div className="text-xs text-[color:var(--sf-info-orange-text)] mb-2">
                {t('vaultInfo.lpFeeDesc', { input: currentVault.inputAsset })}
              </div>
              <div className="text-xs text-[color:var(--sf-info-orange-text)]/70">
                {t('vaultInfo.formula')} <span className="bg-[color:var(--sf-surface)] px-1 rounded">(vault_lp × Δ√k × 0.6) / √k_new</span>
              </div>
            </div>
            <div className="rounded-lg bg-[color:var(--sf-info-blue-bg)] border border-[color:var(--sf-info-blue-border)] p-3">
              <div className="font-semibold text-sm text-[color:var(--sf-info-blue-title)] mb-1">{t('vaultInfo.externalSubsidies')}</div>
              <div className="text-xs text-[color:var(--sf-info-blue-text)]">
                • {t('vaultInfo.subsidyDiesel')}<br/>
                • {t('vaultInfo.subsidyFrbtc')}<br/>
                • {t('vaultInfo.subsidyDeposited')}
              </div>
            </div>
            <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
              <div className="font-semibold text-sm text-[color:var(--sf-info-green-title)] mb-1">{t('vaultInfo.harvestDistribution')}</div>
              <div className="text-xs text-[color:var(--sf-info-green-text)]">
                • {t('vaultInfo.harvestAutoCompound', { output: currentVault.outputAsset })}<br/>
                • {t('vaultInfo.harvestRewardPool')}
              </div>
            </div>
          </div>
        </div>
      )}

      {infoTab === 'info' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.contractType')}</div>
              <div className="font-semibold text-[color:var(--sf-text)]">{t('vaultInfo.unitVault')}</div>
            </div>
            <div>
              <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.inputAsset')}</div>
              <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.inputAsset} [{currentVault.tokenId}]</div>
            </div>
            <div>
              <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.outputUnits')}</div>
              <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.outputAsset} {t('vaultInfo.nonTransferable')}</div>
            </div>
            <div>
              <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.managementFee')}</div>
              <div className="font-semibold text-[color:var(--sf-text)]">0.5%</div>
            </div>
            <div>
              <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.performanceFee')}</div>
              <div className="font-semibold text-[color:var(--sf-text)]">10%</div>
            </div>
            <div>
              <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.timelock')}</div>
              <div className="font-semibold text-green-600">{t('vaultInfo.none')}</div>
            </div>
          </div>
          <div className="pt-3 border-t border-[color:var(--sf-outline)]">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.contractAddress')}</div>
            <div className="text-xs text-[color:var(--sf-info-gray-text)] bg-[color:var(--sf-info-gray-bg)] p-2 rounded">
              {currentVault.contractAddress}
            </div>
          </div>
        </div>
      )}

      {infoTab === 'risk' && (
        <div className="space-y-3">
          <p className="text-sm text-[color:var(--sf-text)]">
            {t('vaultInfo.riskIntro')}
          </p>
          <div className="space-y-2">
            <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
              <div className="font-semibold text-sm text-[color:var(--sf-info-yellow-title)] mb-1">{t('vaultInfo.smartContractRisk')}</div>
              <div className="text-xs text-[color:var(--sf-info-yellow-text)]">
                {t('vaultInfo.smartContractDesc')}
              </div>
            </div>
            <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
              <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">{t('vaultInfo.economicRisks')}</div>
              <div className="text-xs text-[color:var(--sf-info-orange-text)]">
                • <strong>{t('vaultInfo.ilRisk')}</strong> {t('vaultInfo.ilDesc')}<br/>
                • <strong>{t('vaultInfo.subsidyRisk')}</strong> {t('vaultInfo.subsidyDesc')}<br/>
                • <strong>{t('vaultInfo.boostRisk')}</strong> {t('vaultInfo.boostDesc', { output: currentVault.outputAsset })}
              </div>
            </div>
            <div className="rounded-lg bg-[color:var(--sf-info-red-bg)] border border-[color:var(--sf-info-red-border)] p-3">
              <div className="font-semibold text-sm text-[color:var(--sf-info-red-title)] mb-1">{t('vaultInfo.operationalRisks')}</div>
              <div className="text-xs text-[color:var(--sf-info-red-text)]">
                • <strong>{t('vaultInfo.harvestRisk')}</strong> {t('vaultInfo.harvestRiskDesc')}<br/>
                • <strong>{t('vaultInfo.oracleRisk')}</strong> {t('vaultInfo.oracleDesc')}<br/>
                • <strong>{t('vaultInfo.frontRunRisk')}</strong> {t('vaultInfo.frontRunDesc')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Grid Layout: Deposit Panel (Left) + Vault Info (Right) - 50/50 */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${isDxBtc ? 'md:grid-rows-[auto_1fr]' : ''}`}>
        {/* FIRE-style tab buttons for dxBTC */}
        {isDxBtc && (
          <div className="md:col-start-1 md:row-start-1 overflow-x-auto -mx-1 px-1 -my-3 py-3 scrollbar-hide">
            <div className="relative inline-flex items-center gap-2 p-1 min-w-max">
              {(['deposit', 'withdraw', 'boost'] as const).map((tab) => {
                const isActive = mode === tab;
                const isBoostActive = isActive && tab === 'boost';
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMode(tab)}
                    className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none rounded-md whitespace-nowrap overflow-hidden ${
                      isActive
                        ? isBoostActive
                          ? 'text-white shadow-lg'
                          : 'bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white shadow-lg'
                        : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)] shadow-[0_2px_12px_rgba(0,0,0,0.08)]'
                    }`}
                    style={isBoostActive ? { background: 'linear-gradient(to right, var(--sf-boost-icon-from), var(--sf-boost-icon-to))' } : undefined}
                  >
                    {isBoostActive && (
                      <div className="absolute inset-0 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-purple-300/40 to-transparent pointer-events-none" />
                    )}
                    <span className="relative z-10">{t(`vaultDeposit.${tab}`)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Left: Deposit Interface or Boost */}
        <div className={isDxBtc ? 'md:col-start-1 md:row-start-2' : ''}>
          {mode === 'boost' && isDxBtc ? (
            <div className="[&>div]:!block [&>div]:space-y-4">
              <BoostSection vault={currentVault} showPositions />
            </div>
          ) : (
            <VaultDepositInterface
              mode={mode === 'boost' ? 'deposit' : mode}
              onModeChange={setMode}
              vault={currentVault}
              onVaultChange={handleVaultChange}
              userBalance={stats.userBalance}
              apy={stats.apy}
              onExecute={handleExecute}
              vaultUnits={vaultUnits || []}
              selectedUnitId={selectedUnitId}
              onUnitSelect={setSelectedUnitId}
              hideTabs={isDxBtc}
            />
          )}
        </div>

        {/* Right: Vault Info - Card on mobile, Hero on desktop */}
        <div className="md:hidden">
          <VaultListItem
            vault={currentVault}
            isSelected={false}
            onClick={() => {}}
            interactive={false}
          />
        </div>
        <div className={`hidden md:flex md:flex-col gap-6 ${isDxBtc ? 'md:col-start-2 md:row-start-1 md:row-span-2' : ''}`}>
          <VaultHero
            tokenId={currentVault.tokenId}
            tokenName={currentVault.tokenSymbol}
            tokenSymbol={currentVault.tokenSymbol}
            vaultSymbol={currentVault.outputAsset}
            iconPath={currentVault.iconPath}
            contractAddress={currentVault.contractAddress}
            tvl={stats.tvl}
            apy={stats.apy}
            historicalApy={currentVault.historicalApy}
            userBalance={stats.userBalance}
            badges={currentVault.badge ? [currentVault.tokenSymbol, currentVault.badge] : [currentVault.tokenSymbol]}
            riskLevel={currentVault.riskLevel}
            apyHistory={currentVault.apyHistory}
            glowColor={isDxBtc ? '#5b9cff' : undefined}
            compactHeader={isDxBtc ? { title: 'dxBTC Token', subtitle: mode === 'boost' ? `${t('vaultDeposit.pureBtcYield')} ${t('vaultDeposit.tokenBoost')}` : t('vaultDeposit.pureBtcYield') } : undefined}
            boostActive={isDxBtc && mode === 'boost'}
          />
          {/* dxBTC: Info tabs nested under VaultHero in the same column (like FIRE layout) */}
          {isDxBtc && infoTabsPanel}
        </div>
      </div>

      {/* Responsive Grid Layout: 2 columns on md+, stacked on smaller screens */}
      <div className="space-y-6 md:space-y-0">
        {/* Boost Section - Integrated Gauges (hidden for dxBTC since it has a dedicated BOOST tab) */}
        {!isDxBtc && (
          <div className="md:hidden">
            <BoostSection vault={currentVault} />
          </div>
        )}

        {/* Two Column Grid for md+ screens */}
        <div className="hidden md:grid md:grid-cols-2 md:gap-6 md:items-start">
          {/* Boost Section contents will distribute across columns */}
          {!isDxBtc && <BoostSection vault={currentVault} />}

          {/* Right Column: Info Tabs - starts in column 2 after Boosted APY */}
          {!isDxBtc && (
            <div className={`md:col-start-2 ${currentVault.isBoostComingSoon ? 'md:row-start-4' : 'md:row-start-3'}`}>
              {infoTabsPanel}
            </div>
          )}
        </div>

        {/* Info Tabs Section - Mobile/Tablet Only */}
        <div className="md:hidden rounded-xl bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm border-t border-[color:var(--sf-top-highlight)]">
          <div className="flex gap-6 mb-6 border-b border-[color:var(--sf-outline)]">
            {['about', 'strategies', 'info', 'risk'].map((tab) => (
              <button
                key={tab}
                onClick={() => setInfoTab(tab as any)}
                className={`pb-3 text-sm font-semibold capitalize transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  infoTab === tab
                    ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                    : 'text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]'
                }`}
              >
                {t(`vaultInfo.${tab}`)}
              </button>
            ))}
          </div>

          {infoTab === 'about' && (
            <div className="space-y-4">
              <p className="text-sm text-[color:var(--sf-text)]">
                {t('vaultInfo.aboutDesc', { input: currentVault.inputAsset, output: currentVault.outputAsset })}
              </p>
              <div className="space-y-2">
                {[t('vaultInfo.feature1'), t('vaultInfo.feature2'), t('vaultInfo.feature3'), t('vaultInfo.feature4'), t('vaultInfo.feature5')].map((feature, i) => (
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
          
          {infoTab === 'strategies' && (
            <div className="space-y-3">
              <h4 className="font-semibold text-[color:var(--sf-text)]">{t('vaultInfo.activeStrategies')}</h4>
              <div className="space-y-2">
                <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">{t('vaultInfo.lpFeeHarvesting')}</div>
                  <div className="text-xs text-[color:var(--sf-info-orange-text)] mb-2">
                    {t('vaultInfo.lpFeeDesc', { input: currentVault.inputAsset })}
                  </div>
                  <div className="text-xs text-[color:var(--sf-info-orange-text)]/70">
                    {t('vaultInfo.formula')} <span className="bg-[color:var(--sf-surface)] px-1 rounded">(vault_lp × Δ√k × 0.6) / √k_new</span>
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-blue-bg)] border border-[color:var(--sf-info-blue-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-blue-title)] mb-1">{t('vaultInfo.externalSubsidies')}</div>
                  <div className="text-xs text-[color:var(--sf-info-blue-text)]">
                    • {t('vaultInfo.subsidyDiesel')}<br/>
                    • {t('vaultInfo.subsidyFrbtc')}<br/>
                    • {t('vaultInfo.subsidyDeposited')}
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-green-title)] mb-1">{t('vaultInfo.harvestDistribution')}</div>
                  <div className="text-xs text-[color:var(--sf-info-green-text)]">
                    • {t('vaultInfo.harvestAutoCompound', { output: currentVault.outputAsset })}<br/>
                    • {t('vaultInfo.harvestRewardPool')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {infoTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.contractType')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{t('vaultInfo.unitVault')}</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.inputAsset')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.inputAsset} [{currentVault.tokenId}]</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.outputUnits')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.outputAsset} {t('vaultInfo.nonTransferable')}</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.managementFee')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">0.5%</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.performanceFee')}</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">10%</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.timelock')}</div>
                  <div className="font-semibold text-green-600">{t('vaultInfo.none')}</div>
                </div>
              </div>
              <div className="pt-3 border-t border-[color:var(--sf-outline)]">
                <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('vaultInfo.contractAddress')}</div>
                <div className="text-xs text-[color:var(--sf-info-gray-text)] bg-[color:var(--sf-info-gray-bg)] p-2 rounded">
                  {currentVault.contractAddress}
                </div>
              </div>
            </div>
          )}
          
          {infoTab === 'risk' && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--sf-text)]">
                {t('vaultInfo.riskIntro')}
              </p>
              <div className="space-y-2">
                <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-yellow-title)] mb-1">{t('vaultInfo.smartContractRisk')}</div>
                  <div className="text-xs text-[color:var(--sf-info-yellow-text)]">
                    {t('vaultInfo.smartContractDesc')}
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">{t('vaultInfo.economicRisks')}</div>
                  <div className="text-xs text-[color:var(--sf-info-orange-text)]">
                    • <strong>{t('vaultInfo.ilRisk')}</strong> {t('vaultInfo.ilDesc')}<br/>
                    • <strong>{t('vaultInfo.subsidyRisk')}</strong> {t('vaultInfo.subsidyDesc')}<br/>
                    • <strong>{t('vaultInfo.boostRisk')}</strong> {t('vaultInfo.boostDesc', { output: currentVault.outputAsset })}
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-red-bg)] border border-[color:var(--sf-info-red-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-red-title)] mb-1">{t('vaultInfo.operationalRisks')}</div>
                  <div className="text-xs text-[color:var(--sf-info-red-text)]">
                    • <strong>{t('vaultInfo.harvestRisk')}</strong> {t('vaultInfo.harvestRiskDesc')}<br/>
                    • <strong>{t('vaultInfo.oracleRisk')}</strong> {t('vaultInfo.oracleDesc')}<br/>
                    • <strong>{t('vaultInfo.frontRunRisk')}</strong> {t('vaultInfo.frontRunDesc')}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
