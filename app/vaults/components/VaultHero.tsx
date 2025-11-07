"use client";

import { useWallet } from "@/context/WalletContext";

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
}: Props) {
  const { network } = useWallet();
  const tokenImageUrl = `https://asset.oyl.gg/alkanes/${network}/${tokenId.replace(/:/g, '-')}.png`;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#A8C5E8] to-[#8BB4E0] p-6 text-[#1A2B3D] shadow-lg w-[400px] flex flex-col">
      {/* Back button */}
      <button className="mb-4 flex items-center gap-2 text-white/80 hover:text-white transition-colors">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span className="text-sm font-semibold">Back</span>
      </button>

      {/* Token Icon */}
      <div className="mb-4 flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/40 backdrop-blur-sm overflow-hidden border border-white/60">
          <img 
            src={tokenImageUrl} 
            alt={vaultSymbol}
            className="h-16 w-16 object-contain"
            style={{
              filter: 'brightness(0.9) saturate(1.2) hue-rotate(15deg)',
            }}
            onError={(e) => {
              // Fallback to emoji if image fails
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = '<span class="text-4xl">💎</span>';
            }}
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

      {/* Stats - Vertical Stack */}
      <div className="space-y-4">
        <div className="text-center">
          <div className="text-xs text-white/80 mb-1 font-semibold">Total deposited {vaultSymbol}</div>
          <div className="text-2xl font-bold text-white drop-shadow-lg">{tvl}</div>
          <div className="text-xs text-white/90">${tvl}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-white/80 mb-1 font-semibold">Historical APY</div>
          <div className="text-2xl font-bold text-white drop-shadow-lg">{apy}%</div>
          <div className="text-xs text-white/90">Est. APY: {apy}%</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-white/80 mb-1 font-semibold">Your {vaultSymbol} Balance</div>
          <div className="text-2xl font-bold text-white drop-shadow-lg">{userBalance}</div>
          <div className="text-xs text-white/90">$0.00</div>
        </div>
      </div>
    </div>
  );
}
