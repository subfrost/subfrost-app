"use client";

import { useWallet } from "@/context/WalletContext";
import { VaultConfig } from "../constants";

type Props = {
  vault: VaultConfig;
  isSelected: boolean;
  onClick: () => void;
};

export default function VaultListItem({ vault, isSelected, onClick }: Props) {
  const { network } = useWallet();
  const tokenImageUrl = `https://asset.oyl.gg/alkanes/${network}/${vault.tokenId.replace(/:/g, '-')}.png`;

  // Mock data - replace with real vault queries
  const holdings = "0.00";
  const deposits = "$0.00";
  const available = "0.00";

  const riskLevelColors = {
    low: 'text-green-600',
    medium: 'text-yellow-600',
    high: 'text-red-600',
  };

  const badgeColors = {
    'Migrate': 'bg-yellow-400 text-yellow-900',
    'New': 'bg-green-400 text-green-900',
    'Ethereum': 'bg-blue-400 text-blue-900',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 p-4 rounded-lg transition-all hover:bg-white/80 ${
        isSelected 
          ? 'bg-white/90 border-2 border-[color:var(--sf-primary)] shadow-md' 
          : 'bg-white/60 border border-[color:var(--sf-outline)]'
      }`}
    >
      {/* Vault Icon */}
      <div className="relative flex-shrink-0">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#A8C5E8] to-[#7AA8D8] overflow-hidden border border-white/60">
          <img 
            src={tokenImageUrl} 
            alt={vault.tokenSymbol}
            className="h-10 w-10 object-contain"
            style={{
              filter: 'brightness(0.9) saturate(1.2) hue-rotate(15deg)',
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = '<span class="text-xl text-white">💎</span>';
            }}
          />
        </div>
      </div>

      {/* Vault Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-bold text-[color:var(--sf-text)] truncate">{vault.name}</h3>
          {vault.badge && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeColors[vault.badge as keyof typeof badgeColors] || 'bg-gray-400 text-gray-900'}`}>
              {vault.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-[color:var(--sf-text)]/60 truncate">{vault.description}</p>
      </div>

      {/* APY */}
      <div className="flex flex-col items-end min-w-[80px]">
        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Est. APY</div>
        <div className="text-lg font-bold text-green-600">
          {vault.estimatedApy ? `${vault.estimatedApy}%` : '-'}
        </div>
      </div>

      {/* Historical APY */}
      <div className="flex flex-col items-end min-w-[80px]">
        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Hist. APY</div>
        <div className="text-sm font-semibold text-[color:var(--sf-text)]">
          {vault.historicalApy ? `${vault.historicalApy}%` : '-'}
        </div>
      </div>

      {/* Risk Level */}
      <div className="flex flex-col items-center min-w-[80px]">
        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Risk Level</div>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((level) => {
            const riskValue = vault.riskLevel === 'low' ? 2 : vault.riskLevel === 'medium' ? 3 : 4;
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
      <div className="flex flex-col items-end min-w-[80px]">
        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Available</div>
        <div className="text-sm font-semibold text-[color:var(--sf-text)]">{available}</div>
      </div>

      {/* Holdings */}
      <div className="flex flex-col items-end min-w-[80px]">
        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Holdings</div>
        <div className="text-sm font-semibold text-[color:var(--sf-text)]">{holdings}</div>
      </div>

      {/* Deposits */}
      <div className="flex flex-col items-end min-w-[100px]">
        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Deposits</div>
        <div className="text-lg font-bold text-[color:var(--sf-text)]">{deposits}</div>
        <div className="text-xs text-[color:var(--sf-text)]/60">{holdings} {vault.outputAsset}</div>
      </div>
    </button>
  );
}
