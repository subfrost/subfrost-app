"use client";

import { useWallet } from "@/context/WalletContext";
import TokenIcon from "@/app/components/TokenIcon";
import ApySparkline from "./ApySparkline";
import { useTranslation } from '@/hooks/useTranslation';

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
  apyHistory?: number[];
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
  apyHistory = [],
}: Props) {
  const { network } = useWallet();
  const { t } = useTranslation();

  const BADGE_KEYS: Record<string, string> = {
    'Coming Soon': 'badge.comingSoon',
    'BTC Yield': 'badge.btcYield',
    'USD Yield': 'badge.usdYield',
    'Migrate': 'badge.migrate',
    'New': 'badge.new',
  };

  const riskValue = riskLevel === 'low' ? 2 : riskLevel === 'medium' ? 3 : riskLevel === 'high' ? 4 : 5;
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 sm:p-9 shadow-[0_4px_20px_rgba(0,0,0,0.2)] w-full bg-[color:var(--sf-glass-bg)] backdrop-blur-md text-[color:var(--sf-text)] border-t border-[color:var(--sf-top-highlight)]">
      {/* Header - 2 Column Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
        {/* Left Column: Title, Contract, Badges */}
        <div className="flex flex-col justify-center items-center text-center">
          {/* Vault Name */}
          <h1 className="text-3xl font-bold mb-2 text-[color:var(--sf-text)] drop-shadow-lg">{vaultSymbol}</h1>

          {/* Contract Address */}
          <div className="mb-3">
            <button className="text-xs text-[color:var(--sf-text)]/80 hover:text-[color:var(--sf-text)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
              {contractAddress.slice(0, 6)}...{contractAddress.slice(-4)}
            </button>
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              {badges.map((badge, i) => {
                let badgeClassName = "";

                // Determine badge styling based on content
                if (badge === 'Coming Soon') {
                  badgeClassName = "rounded-full bg-[color:var(--sf-badge-coming-soon-bg)] text-[color:var(--sf-badge-coming-soon-text)] px-3 py-1 text-xs font-bold shadow-md border border-[color:var(--sf-badge-coming-soon-border)]";
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
                } else if (badge === 'ORDI') {
                  badgeClassName = "rounded-full bg-black text-white px-3 py-1 text-xs font-bold shadow-md border-2 border-black";
                } else {
                  // Default styling for other badges
                  badgeClassName = "rounded-full bg-[color:var(--sf-surface)]/30 px-3 py-1 text-xs font-bold backdrop-blur-sm text-white border-2 border-white/30 shadow-md";
                }

                return (
                  <span key={i} className={badgeClassName}>
                    {BADGE_KEYS[badge] ? t(BADGE_KEYS[badge]) : badge}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Token Icon */}
        <div className="flex justify-center items-center">
          <div className="w-40 h-40 flex items-center justify-center">
            <img
              src={iconPath || `/tokens/${tokenSymbol.toLowerCase()}.svg`}
              alt={`${tokenSymbol} icon`}
              className={`object-contain rounded-full ${tokenSymbol === 'DIESEL' ? 'w-32 h-32' : 'w-40 h-40'}`}
            />
          </div>
        </div>
      </div>

      {/* APY Sparkline - Full Width Row */}
      {apyHistory.length > 0 && (
        <div className="w-full h-60 mb-6 relative z-10">
          <ApySparkline data={apyHistory} currentApy={parseFloat(apy)} fillHeight={true} />
        </div>
      )}

      {/* Stats - 3x2 Grid */}
      <div className="relative z-10">
        {/* Row 1: Est. APY, Hist. APY, Boosted APY */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">{t('vaultHero.estApy')}</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)]">{apy}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">{t('vaultHero.histApy')}</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)]">{historicalApy ? `${historicalApy}%` : '-'}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">{t('vaultHero.boostedApy')}</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)]">-</div>
          </div>
        </div>

        {/* Row 2: Risk Level, Total Deposited, Your Balance */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">{t('vaultHero.riskLevel')}</div>
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
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">{t('vaultHero.totalDeposited')}</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)]">{tvl}</div>
            <div className="text-xs text-[color:var(--sf-text)]/70">${tvl}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1 font-semibold">{t('vaultHero.yourBalance')}</div>
            <div className="text-2xl font-bold text-[color:var(--sf-text)]">{userBalance}</div>
            <div className="text-xs text-[color:var(--sf-text)]/70">$0.00</div>
          </div>
        </div>
      </div>
    </div>
  );
}
