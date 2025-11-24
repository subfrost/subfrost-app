"use client";

import { useWallet } from "@/context/WalletContext";
import TokenIcon from "@/app/components/TokenIcon";

type Props = {
  tokenId: string; // Alkane ID like "2:0"
  tokenName: string;
  tokenSymbol: string;
  vaultSymbol: string;
  contractAddress: string;
  tvl: string;
  apy: string;
  userBalance: string;
  badges?: string[];
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
};

export default function VaultHero({
  tokenId,
  tokenName,
  tokenSymbol,
  vaultSymbol,
  contractAddress,
  tvl,
  apy,
  userBalance,
  badges = [],
  riskLevel = 'medium',
}: Props) {
  const { network } = useWallet();
  
  const riskValue = riskLevel === 'low' ? 2 : riskLevel === 'medium' ? 3 : riskLevel === 'high' ? 4 : 5;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#A8C5E8] to-[#8BB4E0] p-6 text-[#1A2B3D] shadow-lg w-full flex flex-col">
      {/* Token Icon */}
      <div className="mb-4 flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/40 backdrop-blur-sm overflow-hidden border border-white/60 p-2">
          <TokenIcon 
            key={`hero-${tokenId}-${tokenSymbol}`}
            symbol={tokenSymbol}
            id={tokenId}
            size="xl"
            network={network}
            className="rounded-xl"
          />
        </div>
      </div>

      {/* Vault Name */}
      <h1 className="text-center text-3xl font-bold mb-2 text-white drop-shadow-lg">{vaultSymbol}</h1>
      
      {/* Contract Address */}
      <div className="flex justify-center mb-3">
        <button className="text-xs text-white/80 hover:text-white font-mono transition-colors">
          {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
        </button>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex justify-center gap-2 mb-6">
          {badges.map((badge, i) => (
            <span
              key={i}
              className="rounded-full bg-white/30 px-3 py-1 text-xs font-bold backdrop-blur-sm text-white border border-white/50 shadow-md"
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      {/* Stats - 2 Column Grid */}
      <div className="space-y-4">
        {/* Row 1: Total deposited and Your Balance */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-xs text-white/80 mb-1 font-semibold">Total deposited {vaultSymbol}</div>
            <div className="text-2xl font-bold text-white drop-shadow-lg">{tvl}</div>
            <div className="text-xs text-white/90">${tvl}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/80 mb-1 font-semibold">Your {vaultSymbol} Balance</div>
            <div className="text-2xl font-bold text-white drop-shadow-lg">{userBalance}</div>
            <div className="text-xs text-white/90">$0.00</div>
          </div>
        </div>
        
        {/* Row 2: Historical APY and Est. APY */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-xs text-white/80 mb-1 font-semibold">Historical APY</div>
            <div className="text-2xl font-bold text-white drop-shadow-lg">{apy}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-white/80 mb-1 font-semibold">Est. APY</div>
            <div className="text-2xl font-bold text-white drop-shadow-lg">{apy}%</div>
          </div>
        </div>
        
        {/* Row 3: Risk Level (centered, full width) */}
        <div className="text-center pt-2">
          <div className="text-xs text-white/80 mb-2 font-semibold">Risk Level</div>
          <div className="flex gap-1 justify-center">
            {[1, 2, 3, 4, 5].map((level) => (
              <div 
                key={level}
                className={`w-2 h-5 rounded-sm ${
                  level <= riskValue 
                    ? riskLevel === 'low' ? 'bg-green-400' : riskLevel === 'medium' ? 'bg-yellow-400' : riskLevel === 'high' ? 'bg-orange-400' : 'bg-red-400'
                    : 'bg-white/30'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
