"use client";

import { useWallet } from "@/context/WalletContext";
import { VaultConfig } from "../constants";
import TokenIcon from "@/app/components/TokenIcon";

type Props = {
  vault: VaultConfig;
  isSelected: boolean;
  onClick: () => void;
};

export default function VaultListItem({ vault, isSelected, onClick }: Props) {
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
    'Coming Soon': 'bg-gray-400 text-gray-900',
    'BTC Yield': 'bg-orange-400 text-orange-900',
    'USD Yield': 'bg-green-400 text-green-900',
    'Migrate': 'bg-yellow-400 text-yellow-900',
    'New': 'bg-green-400 text-green-900',
    'Ethereum': 'bg-blue-400 text-blue-900',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full lg:w-auto lg:mx-auto rounded-lg transition-all hover:bg-white/80 overflow-hidden ${
        isSelected 
          ? 'bg-white/90 border-2 border-[color:var(--sf-primary)] shadow-md' 
          : 'bg-white/60 border border-[color:var(--sf-outline)]'
      }`}
    >
      {/* Card layout for small screens */}
      <div className="md:hidden p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full border border-white/60 bg-gradient-to-br from-[#A8C5E8] to-[#7AA8D8] p-1 flex-shrink-0">
            <TokenIcon 
              symbol={vault.tokenSymbol}
              id={vault.tokenId}
              size="md"
              network={network}
              className="rounded-full"
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
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Est. APY</div>
            <div className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
              {vault.estimatedApy ? `${vault.estimatedApy}%` : '-'}
            </div>
          </div>
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Risk Level</div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((level) => {
                const riskValue = vault.riskLevel === 'low' ? 2 : vault.riskLevel === 'medium' ? 3 : vault.riskLevel === 'high' ? 4 : 5;
                return (
                  <div 
                    key={level}
                    className={`w-1.5 h-4 rounded-sm ${
                      level <= riskValue 
                        ? vault.riskLevel === 'low' ? 'bg-green-500' : vault.riskLevel === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                        : 'bg-gray-300'
                    }`}
                  />
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Available</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)]">{availableToken}</div>
            <div className="text-xs text-[color:var(--sf-text)]/60">{availableUsd}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Deposits</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)]">{depositsToken}</div>
            <div className="text-xs text-[color:var(--sf-text)]/60">{depositsUsd}</div>
          </div>
        </div>
      </div>

      {/* List layout for medium screens and up */}
      <div className="hidden md:flex items-center gap-2 md:gap-3 lg:gap-4 p-4">
        {/* Vault Icon */}
        <div className="relative flex-shrink-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#A8C5E8] to-[#7AA8D8] overflow-hidden border border-white/60 p-1">
            <TokenIcon 
              symbol={vault.tokenSymbol}
              id={vault.tokenId}
              size="lg"
              network={network}
              className="rounded-full"
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
          <div className="text-lg font-bold text-green-600 whitespace-nowrap">
            {vault.estimatedApy ? `${vault.estimatedApy}%` : '-'}
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
        <div className="hidden md:flex flex-col items-center min-w-[70px] lg:min-w-[90px] xl:min-w-[90px] flex-shrink-0">
          <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 whitespace-nowrap">Risk Level</div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((level) => {
              const riskValue = vault.riskLevel === 'low' ? 2 : vault.riskLevel === 'medium' ? 3 : vault.riskLevel === 'high' ? 4 : 5;
              return (
                <div 
                  key={level}
                  className={`w-1.5 h-4 rounded-sm ${
                    level <= riskValue 
                      ? vault.riskLevel === 'low' ? 'bg-green-500' : vault.riskLevel === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                      : 'bg-gray-300'
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
    </button>
  );
}
