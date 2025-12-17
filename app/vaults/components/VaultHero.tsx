"use client";

import { useWallet } from "@/context/WalletContext";
import TokenIcon from "@/app/components/TokenIcon";
import Image from "next/image";
import { useMemo } from "react";

function FallingSnowflakes() {
  const snowflakes = useMemo(() => {
    const positions = [10, 22, 35, 48, 60, 72, 85, 95, 5, 65, 43, 28, 78, 50, 18, 88];
    const durations = [15, 18, 12, 20, 14, 17, 13, 19, 14, 14, 12, 16, 13, 18, 17, 15];
    const sizes = [14, 19, 11, 16, 10, 18, 15, 12, 19, 12, 16, 13, 17, 11, 14, 16];
    // Negative delays to start snowflakes at different positions in their animation cycle
    const initialOffsets = [-2, -8, -5, -12, -1, -10, -7, -14, -3, -9, -6, -11, -4, -13, -0.5, -15];
    
    return Array.from({ length: 16 }, (_, i) => ({
      id: i,
      left: positions[i],
      delay: initialOffsets[i],
      duration: durations[i],
      size: sizes[i],
    }));
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes snowfallVault {
            0% {
              transform: translateY(-30px) rotate(0deg);
              opacity: 1;
            }
            100% {
              transform: translateY(800px) rotate(360deg);
              opacity: 1;
            }
          }
          .snowflake-vault {
            filter: brightness(0) invert(0.35) sepia(0.3) saturate(1) hue-rotate(180deg) drop-shadow(0 0 1px rgba(40,67,114,0.2));
          }
          [data-theme="dark"] .snowflake-vault,
          .dark .snowflake-vault {
            filter: brightness(0) invert(1) drop-shadow(0 0 1px rgba(255,255,255,0.3)) !important;
          }
        `
      }} />
      {snowflakes.map((flake) => (
        <Image
          key={flake.id}
          src="/brand/snowflake-mark.svg"
          alt=""
          width={flake.size}
          height={flake.size}
          className="pointer-events-none absolute snowflake-vault"
          style={{
            left: `${flake.left}%`,
            top: '-10px',
            animation: `snowfallVault ${flake.duration}s linear ${flake.delay}s infinite`,
          }}
        />
      ))}
    </>
  );
}

type Props = {
  tokenId: string; // Alkane ID like "2:0"
  tokenName: string;
  tokenSymbol: string;
  vaultSymbol: string;
  iconPath?: string; // Direct path to token icon
  contractAddress: string;
  tvl: string;
  apy: string;
  historicalApy?: string;
  userBalance: string;
  badges?: string[];
  riskLevel?: 'low' | 'medium' | 'high' | 'very-high';
};

export default function VaultHero({
  tokenId,
  tokenName,
  tokenSymbol,
  vaultSymbol,
  iconPath,
  contractAddress,
  tvl,
  apy,
  historicalApy,
  userBalance,
  badges = [],
  riskLevel = 'medium',
}: Props) {
  const { network } = useWallet();
  
  const riskValue = riskLevel === 'low' ? 2 : riskLevel === 'medium' ? 3 : riskLevel === 'high' ? 4 : 5;
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 shadow-lg w-full h-full flex flex-col border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl text-[color:var(--sf-text)]">
      {/* Falling Snowflakes Animation */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <FallingSnowflakes />
      </div>
      
      {/* Token Icon */}
      <div className="mb-4 flex justify-center items-center relative z-10">
        <div className="w-40 h-40 flex items-center justify-center">
          <img
            src={iconPath || `/tokens/${tokenSymbol.toLowerCase()}.svg`}
            alt={`${tokenSymbol} icon`}
            className={`object-contain rounded-2xl ${tokenSymbol === 'DIESEL' ? 'w-32 h-32' : 'w-40 h-40'}`}
          />
        </div>
      </div>

      {/* Vault Name */}
      <h1 className="text-center text-3xl font-bold mb-2 text-[color:var(--sf-text)] drop-shadow-lg relative z-10">{vaultSymbol}</h1>

      {/* Contract Address */}
      <div className="flex justify-center mb-3 relative z-10">
        <button className="text-xs text-[color:var(--sf-text)]/80 hover:text-[color:var(--sf-text)] font-mono transition-colors">
          {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
        </button>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex flex-col items-center gap-2 mb-6 relative z-10">
          {badges.map((badge, i) => {
            let badgeClassName = "";
            
            // Determine badge styling based on content
            if (badge === 'Coming Soon') {
              badgeClassName = "rounded-full bg-[color:var(--sf-badge-coming-soon-bg)] text-[color:var(--sf-badge-coming-soon-text)] px-3 py-1 text-xs font-bold shadow-md border-2 border-[color:var(--sf-badge-coming-soon-border)]";
            } else if (badge === 'BTC' || badge === 'Bitcoin') {
              badgeClassName = "rounded-full bg-[#F7931A] text-white px-3 py-1 text-xs font-bold shadow-md border-2 border-[#F7931A]";
            } else if (badge === 'USD' || badge === 'bUSD') {
              badgeClassName = "rounded-full bg-[#539393] text-white px-3 py-1 text-xs font-bold shadow-md border-2 border-[#539393]";
            } else if (badge === 'DIESEL') {
              badgeClassName = "rounded-full bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 text-white border-2 border-black px-3 py-1 text-xs font-bold shadow-md";
            } else if (badge === 'ETH' || badge === 'Ethereum') {
              badgeClassName = "rounded-full bg-[#987fd9] text-white px-3 py-1 text-xs font-bold shadow-md border-2 border-[#987fd9]";
            } else if (badge === 'ZEC' || badge === 'Zcash') {
              badgeClassName = "rounded-full bg-[#dfb870] text-white px-3 py-1 text-xs font-bold shadow-md border-2 border-[#dfb870]";
            } else if (badge === 'METHANE') {
              badgeClassName = "rounded-full bg-white dark:bg-white text-[#F7931A] border-2 border-black px-3 py-1 text-xs font-bold shadow-md";
            } else if (badge === 'ORDI') {
              badgeClassName = "rounded-full bg-black text-white px-3 py-1 text-xs font-bold shadow-md border-2 border-black";
            } else {
              // Default styling for other badges
              badgeClassName = "rounded-full bg-[color:var(--sf-surface)]/30 px-3 py-1 text-xs font-bold backdrop-blur-sm text-white border-2 border-white/30 shadow-md";
            }
            
            return (
              <span key={i} className={badgeClassName}>
                {badge}
              </span>
            );
          })}
        </div>
      )}

      {/* Stats - 2 Column Grid */}
      <div className="grid grid-cols-2 gap-4 relative z-10">
        {/* Left Column: Est. APY, Hist. APY, Boosted APY */}
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">Est. APY</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)] drop-shadow-lg">{apy}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">Hist. APY</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)] drop-shadow-lg">{historicalApy ? `${historicalApy}%` : '-'}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">Boosted APY</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)] drop-shadow-lg">-</div>
          </div>
        </div>

        {/* Right Column: Risk Level, Total Deposited, Your Balance */}
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">Risk Level</div>
            <div className="flex gap-1 justify-center">
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  key={level}
                  className={`w-2 h-5 rounded-sm shadow-md ${
                    level <= riskValue
                      ? riskLevel === 'low' ? 'bg-green-400' : riskLevel === 'medium' ? 'bg-yellow-400' : riskLevel === 'high' ? 'bg-orange-400' : 'bg-red-400'
                      : 'bg-[color:var(--sf-surface)]/30'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">Total Deposited</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)] drop-shadow-lg">{tvl}</div>
            <div className="text-xs text-[color:var(--sf-text)]/70">${tvl}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">Your Balance</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)] drop-shadow-lg">{userBalance}</div>
            <div className="text-xs text-[color:var(--sf-text)]/70">$0.00</div>
          </div>
        </div>
      </div>
    </div>
  );
}
