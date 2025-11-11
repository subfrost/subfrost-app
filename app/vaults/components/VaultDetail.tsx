"use client";

import { useState } from "react";
import VaultHero from "./VaultHero";
import VaultDepositInterface from "./VaultDepositInterface";
import { VaultConfig } from "../constants";
import { useVaultStats } from "@/hooks/useVaultStats";
import { useVaultDeposit } from "@/hooks/useVaultDeposit";
import { useVaultWithdraw } from "@/hooks/useVaultWithdraw";
import { useVaultUnits } from "@/hooks/useVaultUnits";

type Props = {
  vault: VaultConfig;
};

export default function VaultDetail({ vault }: Props) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [infoTab, setInfoTab] = useState<'about' | 'strategies' | 'info' | 'risk'>('about');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');

  // Fetch real vault stats
  const { data: vaultStats, isLoading: isLoadingStats } = useVaultStats(
    vault.contractAddress,
    vault.tokenId
  );
  
  // Fetch user's vault units (for withdraw)
  const { data: vaultUnits, isLoading: isLoadingUnits } = useVaultUnits(vault.tokenId);
  
  // Vault mutation hooks
  const depositMutation = useVaultDeposit();
  const withdrawMutation = useVaultWithdraw();

  const stats = {
    tvl: vaultStats?.tvlFormatted || "0.00",
    apy: vault.estimatedApy || vaultStats?.apy || "0.00",
    userBalance: vaultStats?.userBalanceFormatted || "0.00",
  };

  const handleExecute = async (amount: string) => {
    const feeRate = 10; // Default fee rate, TODO: fetch from fee estimator
    
    if (mode === 'deposit') {
      try {
        const result = await depositMutation.mutateAsync({
          vaultContractId: vault.contractAddress,
          tokenId: vault.tokenId,
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
          vaultContractId: vault.contractAddress,
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
      {/* Flex Layout: Deposit Panel (Left) + Hero Card (Right) */}
      <div className="flex gap-6 items-start">
        {/* Left: Deposit Interface */}
        <VaultDepositInterface
          mode={mode}
          onModeChange={setMode}
          inputToken={vault.inputAsset}
          outputToken={vault.outputAsset}
          tokenId={vault.tokenId}
          userBalance={stats.userBalance}
          apy={stats.apy}
          onExecute={handleExecute}
          vaultUnits={vaultUnits || []}
          selectedUnitId={selectedUnitId}
          onUnitSelect={setSelectedUnitId}
        />

        {/* Right: Hero Section */}
        <VaultHero
          tokenId={vault.tokenId}
          tokenName={vault.tokenSymbol}
          tokenSymbol={vault.tokenSymbol}
          vaultSymbol={vault.outputAsset}
          contractAddress={vault.contractAddress}
          tvl={stats.tvl}
          apy={stats.apy}
          userBalance={stats.userBalance}
          badges={[vault.tokenSymbol, vault.badge || 'Bitcoin']}
        />
      </div>

      {/* Info Tabs Section */}
      <div className="rounded-xl border border-[color:var(--sf-outline)] bg-white/60 p-6 backdrop-blur-sm">
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
              Lock {vault.inputAsset} to earn yield from LP trading fees and external subsidies. Your {vault.outputAsset} provides boost to gauge stakers.
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
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-text)] mb-1">LP Fee Harvesting</div>
                <div className="text-xs text-[color:var(--sf-text)] mb-2">
                  Extracts 60% of trading fees from {vault.inputAsset}/frBTC pool using k-value growth tracking
                </div>
                <div className="text-xs text-[color:var(--sf-text)]/70">
                  Formula: <code className="bg-white px-1 rounded">(vault_lp × Δ√k × 0.6) / √k_new</code>
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="font-semibold text-sm text-[color:var(--sf-text)] mb-1">External Subsidies</div>
                <div className="text-xs text-[color:var(--sf-text)]">
                  • DIESEL from Protorunes rewards<br/>
                  • frBTC from Bitcoin wrapper fees<br/>
                  • Deposited by strategist
                </div>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                <div className="font-semibold text-sm text-blue-900 mb-1">Harvest Distribution</div>
                <div className="text-xs text-blue-800">
                  • 10% auto-compound (locked as more {vault.outputAsset})<br/>
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
                <div className="font-semibold text-[color:var(--sf-text)]">{vault.inputAsset} [{vault.tokenId}]</div>
              </div>
              <div>
                <div className="text-[color:var(--sf-text)]/60 mb-1">Output Units</div>
                <div className="font-semibold text-[color:var(--sf-text)]">{vault.outputAsset} (non-transferable)</div>
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
              <div className="font-mono text-xs text-[color:var(--sf-text)] bg-gray-50 p-2 rounded">
                {vault.contractAddress}
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
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <div className="font-semibold text-sm text-yellow-900 mb-1">Smart Contract Risk</div>
                <div className="text-xs text-yellow-800">
                  Contracts are immutable once deployed. Recommend external audit before mainnet. Test thoroughly on testnet first.
                </div>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                <div className="font-semibold text-sm text-orange-900 mb-1">Economic Risks</div>
                <div className="text-xs text-orange-800">
                  • <strong>Impermanent Loss:</strong> LP providers exposed to IL<br/>
                  • <strong>Subsidy Variability:</strong> External rewards may fluctuate<br/>
                  • <strong>Boost Competition:</strong> More {vault.outputAsset} dilutes individual boost
                </div>
              </div>
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <div className="font-semibold text-sm text-red-900 mb-1">Operational Risks</div>
                <div className="text-xs text-red-800">
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
  );
}
