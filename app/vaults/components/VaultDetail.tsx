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

type Props = {
  vault: VaultConfig;
};

export default function VaultDetail({ vault: initialVault }: Props) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [infoTab, setInfoTab] = useState<'about' | 'strategies' | 'info' | 'risk'>('about');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [currentVault, setCurrentVault] = useState<VaultConfig>(initialVault);

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

  return (
    <div className="space-y-6">
      {/* Grid Layout: Deposit Panel (Left) + Vault Info (Right) - 50/50 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Deposit Interface */}
        <VaultDepositInterface
          mode={mode}
          onModeChange={setMode}
          vault={currentVault}
          onVaultChange={handleVaultChange}
          userBalance={stats.userBalance}
          apy={stats.apy}
          onExecute={handleExecute}
          vaultUnits={vaultUnits || []}
          selectedUnitId={selectedUnitId}
          onUnitSelect={setSelectedUnitId}
        />

        {/* Right: Vault Info - Card on mobile, Hero on desktop */}
        <div className="md:hidden">
          <VaultListItem
            vault={currentVault}
            isSelected={false}
            onClick={() => {}}
            interactive={false}
          />
        </div>
        <div className="hidden md:flex md:flex-col">
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
          />
        </div>
      </div>

      {/* Responsive Grid Layout: 2 columns on md+, stacked on smaller screens */}
      <div className="space-y-6 md:space-y-0">
        {/* Boost Section - Integrated Gauges */}
        <div className="md:hidden">
          <BoostSection vault={currentVault} />
        </div>

        {/* Two Column Grid for md+ screens */}
        <div className="hidden md:grid md:grid-cols-2 md:gap-6 md:items-start">
          {/* Boost Section contents will distribute across columns */}
          <BoostSection vault={currentVault} />

          {/* Right Column: Info Tabs - starts in column 2 after Boosted APY */}
          <div className={`rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm h-fit md:col-start-2 ${currentVault.isBoostComingSoon ? 'md:row-start-4' : 'md:row-start-3'}`}>
        <div className="flex gap-6 mb-6 border-b border-[color:var(--sf-outline)]">
          {['about', 'strategies', 'info', 'risk'].map((tab) => (
            <button
              key={tab}
              onClick={() => setInfoTab(tab as any)}
              className={`pb-3 text-sm font-semibold capitalize transition-colors ${
                infoTab === tab
                  ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {infoTab === 'about' && (
          <div className="space-y-4">
            <p className="text-sm text-[color:var(--sf-text)]">
              Lock {currentVault.inputAsset} to earn yield from LP trading fees and external subsidies. Your {currentVault.outputAsset} provides boost to gauge stakers.
            </p>
            <div className="space-y-2">
              {[
                'Earn 60% of LP trading fees',
                'Receive external subsidy rewards (frBTC, DIESEL)',
                '10% auto-compound on harvest',
                'No withdrawal timelock',
                'Provides boost to gauge stakers (1x to 2.5x)',
              ].map((feature, i) => (
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
            <h4 className="font-semibold text-[color:var(--sf-text)]">Active Strategies</h4>
            <div className="space-y-2">
              <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">LP Fee Harvesting</div>
                <div className="text-xs text-[color:var(--sf-info-orange-text)] mb-2">
                  Extracts 60% of trading fees from {currentVault.inputAsset}/frBTC pool using k-value growth tracking
                </div>
                <div className="text-xs text-[color:var(--sf-info-orange-text)]/70">
                  Formula: <code className="bg-[color:var(--sf-surface)] px-1 rounded">(vault_lp × Δ√k × 0.6) / √k_new</code>
                </div>
              </div>
              <div className="rounded-lg bg-[color:var(--sf-info-blue-bg)] border border-[color:var(--sf-info-blue-border)] p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-info-blue-title)] mb-1">External Subsidies</div>
                <div className="text-xs text-[color:var(--sf-info-blue-text)]">
                  • DIESEL from Protorunes rewards<br/>
                  • frBTC from Bitcoin wrapper fees<br/>
                  • Deposited by strategist
                </div>
              </div>
              <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-info-green-title)] mb-1">Harvest Distribution</div>
                <div className="text-xs text-[color:var(--sf-info-green-text)]">
                  • 10% auto-compound (locked as more {currentVault.outputAsset})<br/>
                  • 90% added to reward pool for claimants
                </div>
              </div>
            </div>
          </div>
        )}
        
        {infoTab === 'info' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Contract Type</div>
                <div className="font-semibold text-[color:var(--sf-text)]">UnitVault</div>
              </div>
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Input Asset</div>
                <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.inputAsset} [{currentVault.tokenId}]</div>
              </div>
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Output Units</div>
                <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.outputAsset} (non-transferable)</div>
              </div>
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Management Fee</div>
                <div className="font-semibold text-[color:var(--sf-text)]">0%</div>
              </div>
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Performance Fee</div>
                <div className="font-semibold text-[color:var(--sf-text)]">10%</div>
              </div>
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Timelock</div>
                <div className="font-semibold text-green-600">None</div>
              </div>
            </div>
            <div className="pt-3 border-t border-[color:var(--sf-outline)]">
              <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Vault Contract Address</div>
              <div className="font-mono text-xs text-[color:var(--sf-info-gray-text)] bg-[color:var(--sf-info-gray-bg)] p-2 rounded">
                {currentVault.contractAddress}
              </div>
            </div>
          </div>
        )}
        
        {infoTab === 'risk' && (
          <div className="space-y-3">
            <p className="text-sm text-[color:var(--sf-text)]">
              All vaults carry risk. Please review carefully before depositing.
            </p>
            <div className="space-y-2">
              <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-info-yellow-title)] mb-1">Smart Contract Risk</div>
                <div className="text-xs text-[color:var(--sf-info-yellow-text)]">
                  Contracts are immutable once deployed. Recommend external audit before mainnet. Test thoroughly on testnet first.
                </div>
              </div>
              <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">Economic Risks</div>
                <div className="text-xs text-[color:var(--sf-info-orange-text)]">
                  • <strong>Impermanent Loss:</strong> LP providers exposed to IL<br/>
                  • <strong>Subsidy Variability:</strong> External rewards may fluctuate<br/>
                  • <strong>Boost Competition:</strong> More {currentVault.outputAsset} dilutes individual boost
                </div>
              </div>
              <div className="rounded-lg bg-[color:var(--sf-info-red-bg)] border border-[color:var(--sf-info-red-border)] p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-info-red-title)] mb-1">Operational Risks</div>
                <div className="text-xs text-[color:var(--sf-info-red-text)]">
                  • <strong>Harvest Dependency:</strong> Requires strategist to call harvest<br/>
                  • <strong>Oracle Manipulation:</strong> K-value uses instant price (not TWAP)<br/>
                  • <strong>Front-running:</strong> Harvest could be front-run in theory
                </div>
              </div>
            </div>
          </div>
        )}
          </div>
        </div>

        {/* Info Tabs Section - Mobile/Tablet Only */}
        <div className="md:hidden rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm">
          <div className="flex gap-6 mb-6 border-b border-[color:var(--sf-outline)]">
            {['about', 'strategies', 'info', 'risk'].map((tab) => (
              <button
                key={tab}
                onClick={() => setInfoTab(tab as any)}
                className={`pb-3 text-sm font-semibold capitalize transition-colors ${
                  infoTab === tab
                    ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                    : 'text-[color:var(--sf-text)] hover:text-[color:var(--sf-text)]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {infoTab === 'about' && (
            <div className="space-y-4">
              <p className="text-sm text-[color:var(--sf-text)]">
                Lock {currentVault.inputAsset} to earn yield from LP trading fees and external subsidies. Your {currentVault.outputAsset} provides boost to gauge stakers.
              </p>
              <div className="space-y-2">
                {[
                  'Earn 60% of LP trading fees',
                  'Receive external subsidy rewards (frBTC, DIESEL)',
                  '10% auto-compound on harvest',
                  'No withdrawal timelock',
                  'Provides boost to gauge stakers (1x to 2.5x)',
                ].map((feature, i) => (
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
              <h4 className="font-semibold text-[color:var(--sf-text)]">Active Strategies</h4>
              <div className="space-y-2">
                <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">LP Fee Harvesting</div>
                  <div className="text-xs text-[color:var(--sf-info-orange-text)] mb-2">
                    Extracts 60% of trading fees from {currentVault.inputAsset}/frBTC pool using k-value growth tracking
                  </div>
                  <div className="text-xs text-[color:var(--sf-info-orange-text)]/70">
                    Formula: <code className="bg-[color:var(--sf-surface)] px-1 rounded">(vault_lp × Δ√k × 0.6) / √k_new</code>
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-blue-bg)] border border-[color:var(--sf-info-blue-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-blue-title)] mb-1">External Subsidies</div>
                  <div className="text-xs text-[color:var(--sf-info-blue-text)]">
                    • DIESEL from Protorunes rewards<br/>
                    • frBTC from Bitcoin wrapper fees<br/>
                    • Deposited by strategist
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-green-title)] mb-1">Harvest Distribution</div>
                  <div className="text-xs text-[color:var(--sf-info-green-text)]">
                    • 10% auto-compound (locked as more {currentVault.outputAsset})<br/>
                    • 90% added to reward pool for claimants
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {infoTab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">Contract Type</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">UnitVault</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">Input Asset</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.inputAsset} [{currentVault.tokenId}]</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">Output Units</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">{currentVault.outputAsset} (non-transferable)</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">Management Fee</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">0%</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">Performance Fee</div>
                  <div className="font-semibold text-[color:var(--sf-text)]">10%</div>
                </div>
                <div>
                  <div className="text-[color:var(--sf-text)]/60 mb-1">Timelock</div>
                  <div className="font-semibold text-green-600">None</div>
                </div>
              </div>
              <div className="pt-3 border-t border-[color:var(--sf-outline)]">
                <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Vault Contract Address</div>
                <div className="font-mono text-xs text-[color:var(--sf-info-gray-text)] bg-[color:var(--sf-info-gray-bg)] p-2 rounded">
                  {currentVault.contractAddress}
                </div>
              </div>
            </div>
          )}
          
          {infoTab === 'risk' && (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--sf-text)]">
                All vaults carry risk. Please review carefully before depositing.
              </p>
              <div className="space-y-2">
                <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-yellow-title)] mb-1">Smart Contract Risk</div>
                  <div className="text-xs text-[color:var(--sf-info-yellow-text)]">
                    Contracts are immutable once deployed. Recommend external audit before mainnet. Test thoroughly on testnet first.
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-orange-bg)] border border-[color:var(--sf-info-orange-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-orange-title)] mb-1">Economic Risks</div>
                  <div className="text-xs text-[color:var(--sf-info-orange-text)]">
                    • <strong>Impermanent Loss:</strong> LP providers exposed to IL<br/>
                    • <strong>Subsidy Variability:</strong> External rewards may fluctuate<br/>
                    • <strong>Boost Competition:</strong> More {currentVault.outputAsset} dilutes individual boost
                  </div>
                </div>
                <div className="rounded-lg bg-[color:var(--sf-info-red-bg)] border border-[color:var(--sf-info-red-border)] p-3">
                  <div className="font-semibold text-sm text-[color:var(--sf-info-red-title)] mb-1">Operational Risks</div>
                  <div className="text-xs text-[color:var(--sf-info-red-text)]">
                    • <strong>Harvest Dependency:</strong> Requires strategist to call harvest<br/>
                    • <strong>Oracle Manipulation:</strong> K-value uses instant price (not TWAP)<br/>
                    • <strong>Front-running:</strong> Harvest could be front-run in theory
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
