"use client";

import { useWallet } from "@/context/WalletContext";
import { VaultConfig } from "../constants";
import TokenIcon from "@/app/components/TokenIcon";

type Props = {
  vault: VaultConfig;
  isSelected: boolean;
  onClick: () => void;
  interactive?: boolean;
};

function formatApyBadge(apy: string | undefined): string {
  if (!apy) return '-';
  const rounded = Math.ceil(parseFloat(apy));
  return `~${rounded}%`;
}

export default function VaultListItem({ vault, isSelected, onClick, interactive = true }: Props) {
  const { network } = useWallet();

  // Mock data - replace with real vault queries
  const depositsUsd = "$0.00";
  const depositsToken = "0.00";
  const availableUsd = "$0.00";
  const availableToken = "0.00";

  const riskLevelColors = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-red-600',
  };

  const badgeColors = {
    'Coming Soon': 'bg-[color:var(--sf-badge-coming-soon-bg)] border border-[color:var(--sf-badge-coming-soon-border)] text-[color:var(--sf-badge-coming-soon-text)]',
    'BTC Yield': 'bg-orange-400 text-orange-900',
    'USD Yield': 'bg-green-400 text-green-900',
    'Migrate': 'bg-yellow-400 text-yellow-900',
    'New': 'bg-green-400 text-green-900',
    'Ethereum': 'bg-blue-400 text-blue-900',
  };

  const Element = interactive ? 'button' : 'div';
  
  return (
    <Element
      onClick={interactive ? onClick : undefined}
      className={`w-full lg:w-auto lg:mx-auto rounded-lg transition-all overflow-hidden ${
        interactive ? 'hover:bg-[color:var(--sf-surface)]/80 cursor-pointer' : 'cursor-default'
      } ${
        isSelected 
          ? 'bg-[color:var(--sf-surface)]/90 border-2 border-[color:var(--sf-primary)] shadow-md' 
          : 'bg-[color:var(--sf-surface)]/60 border border-[color:var(--sf-outline)]'
      }`}
    >
      {/* Card layout for small screens */}
      <div className="md:hidden p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 flex-shrink-0 flex items-center justify-center">
            <img
              src={vault.iconPath || `/tokens/${vault.tokenSymbol.toLowerCase()}.svg`}
              alt={`${vault.tokenSymbol} icon`}
              className={`object-contain ${vault.tokenSymbol === 'DIESEL' ? 'w-8 h-8' : 'w-full h-full'}`}
            />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-[color:var(--sf-text)] truncate">{vault.name}</h3>
              {vault.badge && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${badgeColors[vault.badge as keyof typeof badgeColors] || 'bg-gray-400 text-gray-900'}`}>
                  {vault.badge}
                </span>
              )}
            </div>
            <p className="text-xs text-[color:var(--sf-text)]/60 truncate">{vault.description}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-x-3">
          {/* Row 1: EST. APY and RISK LEVEL */}
          <div className="h-[42px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Est. APY</div>
            <div className="inline-flex items-center justify-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-3 py-1 text-sm font-bold text-[color:var(--sf-info-green-title)] min-w-[60px]">
              {formatApyBadge(vault.estimatedApy)}
            </div>
          </div>
          <div className={`h-[42px] ${interactive ? 'flex flex-col items-center' : ''}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Risk Level</div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((level) => {
                const riskValue = vault.riskLevel === 'low' ? 2 : vault.riskLevel === 'medium' ? 3 : vault.riskLevel === 'high' ? 4 : 5;
                return (
                  <div
                    key={level}
                    className={`w-1.5 h-4 rounded-sm ${
                      level <= riskValue
                        ? vault.riskLevel === 'low' ? 'bg-green-500' : vault.riskLevel === 'medium' ? 'bg-yellow-500' : vault.riskLevel === 'high' ? 'bg-orange-500' : 'bg-red-500'
                        : 'bg-[color:var(--sf-surface)]/30'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Row 2: AVAILABLE and DEPOSITS */}
          <div className="pt-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Available</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)]">{availableToken}</div>
            <div className="text-xs text-[color:var(--sf-text)]/60">{availableUsd}</div>
          </div>
          <div className={`pt-3 ${interactive ? 'text-center' : ''}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Deposits</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)]">{depositsToken}</div>
            <div className="text-xs text-[color:var(--sf-text)]/60">{depositsUsd}</div>
          </div>
        </div>
      </div>

      {/* List layout for medium screens and up */}
      <div className="hidden md:flex items-start gap-2 md:gap-3 lg:gap-4 p-4">
        {/* Vault Icon */}
        <div className="relative flex-shrink-0">
          <div className="flex h-12 w-12 items-center justify-center">
            <img
              src={vault.iconPath || `/tokens/${vault.tokenSymbol.toLowerCase()}.svg`}
              alt={`${vault.tokenSymbol} icon`}
              className={`object-contain ${vault.tokenSymbol === 'DIESEL' ? 'w-10 h-10' : 'w-full h-full'}`}
            />
          </div>
        </div>

        {/* Vault Info */}
        <div className="min-w-[200px] max-w-[300px] lg:max-w-[400px] text-left">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-bold text-[color:var(--sf-text)] whitespace-nowrap">{vault.name}</h3>
            {vault.badge && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${badgeColors[vault.badge as keyof typeof badgeColors] || 'bg-gray-400 text-gray-900'}`}>
                {vault.badge}
              </span>
            )}
          </div>
          <p className="text-xs text-[color:var(--sf-text)]/60 truncate">{vault.description}</p>
        </div>

        {/* APY */}
        <div className="flex flex-col items-end min-w-[70px] lg:min-w-[90px] xl:min-w-[90px] flex-shrink-0">
          <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 whitespace-nowrap">Est. APY</div>
          <div className="inline-flex items-center justify-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)] min-w-[52px]">
            {formatApyBadge(vault.estimatedApy)}
          </div>
        </div>

        {/* Historical APY */}
        <div className="hidden lg:flex flex-col items-end min-w-[70px] lg:min-w-[90px] xl:min-w-[90px] flex-shrink-0">
          <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 whitespace-nowrap">Hist. APY</div>
          <div className="text-sm font-semibold text-[color:var(--sf-text)] whitespace-nowrap">
            {vault.historicalApy ? `${vault.historicalApy}%` : '-'}
          </div>
        </div>

        {/* Risk Level */}
        <div className="hidden md:flex flex-col items-end min-w-[70px] lg:min-w-[90px] xl:min-w-[90px] flex-shrink-0">
          <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 whitespace-nowrap">Risk Level</div>
          <div className="flex gap-0.5 justify-end">
            {[1, 2, 3, 4, 5].map((level) => {
              const riskValue = vault.riskLevel === 'low' ? 2 : vault.riskLevel === 'medium' ? 3 : vault.riskLevel === 'high' ? 4 : 5;
              return (
                <div 
                  key={level}
                  className={`w-1.5 h-4 rounded-sm ${
                    level <= riskValue
                      ? vault.riskLevel === 'low' ? 'bg-green-500' : vault.riskLevel === 'medium' ? 'bg-yellow-500' : vault.riskLevel === 'high' ? 'bg-orange-500' : 'bg-red-500'
                      : 'bg-[color:var(--sf-surface)]/30'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Available */}
        <div className="flex flex-col items-end min-w-[70px] lg:min-w-[90px] xl:min-w-[90px] flex-shrink-0">
          <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 whitespace-nowrap">Available</div>
          <div className="text-lg font-bold text-[color:var(--sf-text)] whitespace-nowrap">{availableToken}</div>
          <div className="text-xs text-[color:var(--sf-text)]/60 whitespace-nowrap">{availableUsd}</div>
        </div>

        {/* Deposits */}
        <div className="flex flex-col items-end min-w-[70px] lg:min-w-[90px] xl:min-w-[90px] flex-shrink-0">
          <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 whitespace-nowrap">Deposits</div>
          <div className="text-lg font-bold text-[color:var(--sf-text)] whitespace-nowrap">{depositsToken}</div>
          <div className="text-xs text-[color:var(--sf-text)]/60 whitespace-nowrap">{depositsUsd}</div>
        </div>
      </div>
    </Element>
  );
}
