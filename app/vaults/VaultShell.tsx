"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@/context/WalletContext";
import { useTranslation } from "@/hooks/useTranslation";
import { AVAILABLE_VAULTS, VaultConfig } from "./constants";
import VaultListItem from "./components/VaultListItem";
import VaultDetail from "./components/VaultDetail";

type SortField = 'estimatedApy' | 'historicalApy' | 'riskLevel' | 'available' | 'deposits';
type SortDirection = 'asc' | 'desc' | null;
type VaultFilter = 'all' | 'mains' | 'alts';

// Vault category definitions
const MAINS_VAULT_IDS = ['dx-btc', 've-usd', 've-eth'];
const ALTS_VAULT_IDS = ['ve-diesel', 've-ordi'];

export default function VaultShell() {
  const { t } = useTranslation();
  const { network } = useWallet();
  const searchParams = useSearchParams();
  const [selectedVault, setSelectedVault] = useState<VaultConfig | null>(null);

  // Check for vault ID in URL params on mount
  useEffect(() => {
    const vaultId = searchParams.get('vault');
    if (vaultId) {
      const vault = AVAILABLE_VAULTS.find(v => v.id === vaultId);
      if (vault) {
        setSelectedVault(vault);
      }
    }
  }, [searchParams]);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [vaultFilter, setVaultFilter] = useState<VaultFilter>('all');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction or clear
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        setSortField(null);
        setSortDirection(null);
      } else {
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Show yv-frbtc on regtest/oylnet for testing, hide on mainnet
  const isTestNetwork = network === 'regtest' || network === 'oylnet';

  const filteredVaults = useMemo(() => {
    let vaults = isTestNetwork
      ? AVAILABLE_VAULTS
      : AVAILABLE_VAULTS.filter(vault => vault.id !== 'yv-frbtc');
    
    // Apply vault category filter
    if (vaultFilter === 'mains') {
      vaults = vaults.filter(vault => MAINS_VAULT_IDS.includes(vault.id));
    } else if (vaultFilter === 'alts') {
      vaults = vaults.filter(vault => ALTS_VAULT_IDS.includes(vault.id));
    }
    
    if (sortField && sortDirection) {
      vaults = [...vaults].sort((a, b) => {
        let compareValue = 0;
        
        switch (sortField) {
          case 'estimatedApy': {
            const aVal = parseFloat(a.estimatedApy || '0');
            const bVal = parseFloat(b.estimatedApy || '0');
            compareValue = aVal - bVal;
            break;
          }
          case 'historicalApy': {
            const aVal = parseFloat(a.historicalApy || '0');
            const bVal = parseFloat(b.historicalApy || '0');
            compareValue = aVal - bVal;
            break;
          }
          case 'riskLevel': {
            const riskValues = { 'low': 1, 'medium': 2, 'high': 3, 'very-high': 4 };
            const aVal = riskValues[a.riskLevel || 'medium'];
            const bVal = riskValues[b.riskLevel || 'medium'];
            compareValue = aVal - bVal;
            break;
          }
          case 'available':
          case 'deposits':
            // Mock data for now - all zeros, so no sorting effect
            compareValue = 0;
            break;
        }
        
        return sortDirection === 'asc' ? compareValue : -compareValue;
      });
    } else {
      // Default sorting: dx-btc first
      vaults = vaults.sort((a, b) => {
        if (a.id === 'dx-btc') return -1;
        if (b.id === 'dx-btc') return 1;
        return 0;
      });
    }
    
    return vaults;
  }, [sortField, sortDirection, isTestNetwork, vaultFilter]);

  // Vault detail view - full width with 1/2 + 1/2 grid
  if (selectedVault) {
    return (
      <div className="flex w-full flex-col gap-6">
        {/* Back Button */}
        <button
          onClick={() => setSelectedVault(null)}
          className="flex items-center gap-2 text-[color:var(--sf-text)] hover:text-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm font-semibold">{t('vaults.backToOverview')}</span>
        </button>

        {/* Vault Detail with integrated boost */}
        <VaultDetail vault={selectedVault} />
      </div>
    );
  }

  // Vault overview - full width
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-col gap-3">
          {/* Filter Buttons - mobile/tablet only */}
          <div className="col-span-full flex items-center gap-2 mb-2 lg:hidden">
            <button
              onClick={() => setVaultFilter('all')}
              className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
                vaultFilter === 'all'
                  ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                  : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
              }`}
            >
              {t('vaults.all')}
            </button>
            <button
              onClick={() => setVaultFilter('mains')}
              className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
                vaultFilter === 'mains'
                  ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                  : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
              }`}
            >
              {t('vaults.mains')}
            </button>
            <button
              onClick={() => setVaultFilter('alts')}
              className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
                vaultFilter === 'alts'
                  ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                  : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
              }`}
            >
              {t('vaults.alts')}
            </button>
          </div>

          {/* Sorting Header - only visible on lg+ screens */}
          <div className="hidden lg:flex items-center pb-1 bg-transparent w-full">
            {/* Filter Buttons at left */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVaultFilter('all')}
                className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
                  vaultFilter === 'all'
                    ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                    : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                }`}
              >
                {t('vaults.all')}
              </button>
              <button
                onClick={() => setVaultFilter('mains')}
                className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
                  vaultFilter === 'mains'
                    ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                    : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                }`}
              >
                {t('vaults.mains')}
              </button>
              <button
                onClick={() => setVaultFilter('alts')}
                className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
                  vaultFilter === 'alts'
                    ? 'bg-[color:var(--sf-primary)] text-white shadow-lg'
                    : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
                }`}
              >
                {t('vaults.alts')}
              </button>
            </div>

          </div>

          {/* Vault List */}
          {filteredVaults.map((vault) => (
            <VaultListItem
              key={vault.id}
              vault={vault}
              isSelected={false}
              onClick={() => setSelectedVault(vault)}
            />
          ))}

          {filteredVaults.length === 0 && (
            <div className="text-center py-12 text-[color:var(--sf-text)]/60">
              {t('vaults.noVaults')}
            </div>
          )}
        </div>
    </div>
  );
}
