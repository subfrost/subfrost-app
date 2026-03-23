"use client";

import { useState, useRef } from "react";
import { VaultConfig } from "../constants";
import { TrendingUp, Lock, AlertCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@/context/WalletContext";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import { useTranslation } from '@/hooks/useTranslation';


type Props = {
  vault: VaultConfig;
  showPositions?: boolean;
};

export default function BoostSection({ vault, showPositions = false }: Props) {
  const [stakeAmount, setStakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const { network } = useWallet();
  const { t } = useTranslation();


  // Boost stats: zero until boost/gauge contract is deployed on-chain
  const userVeTokenBalance = "0.00";
  const userVeTokenBalanceFormatted = "0.00";
  const totalVxTokenStaked = "0.00";
  const multiplier = vault.boostMultiplier || 1.5;
  const boostMultiplier = `${multiplier}x`;

  // Check if this is the special dxBTC vault with FUEL
  const isComingSoon = vault.isBoostComingSoon;

  if (!vault.hasBoost) {
    return (
      <div className="rounded-2xl bg-[color:var(--sf-surface)]/40 backdrop-blur-sm p-6 border-t border-[color:var(--sf-top-highlight)]">
        <div className="flex items-center gap-3 text-[color:var(--sf-text)]/60">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">
            {t('boost.noBoost')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-0 md:contents">
      {/* Boost Header - Spans both columns on md+ */}
      <div className="flex items-center justify-between md:col-span-2 md:row-start-1">
        <div className="flex items-center gap-3">
          <div 
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: `linear-gradient(to bottom right, var(--sf-boost-icon-from), var(--sf-boost-icon-to))` }}
          >
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[color:var(--sf-text)]">
              {t('boost.boostYourYield')}
            </h3>
            <p className="text-xs text-[color:var(--sf-text)]/60">
              {t('boost.stakeToIncrease', { token: vault.boostTokenSymbol || '' })}
            </p>
          </div>
        </div>

      </div>

      {isComingSoon && (
        <div className="rounded-xl border-2 border-[color:var(--sf-coming-soon-title)]/30 bg-[color:var(--sf-coming-soon-bg)] p-4 md:col-span-2 md:row-start-2">
          <div className="flex items-center gap-2 text-[color:var(--sf-coming-soon-title)]">
            <Lock size={18} />
            <span className="text-sm font-semibold">{t('boost.comingSoon')}</span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--sf-coming-soon-text)]">
            {t('boost.fuelNotAvailable')}
          </p>
        </div>
      )}


      {/* Boost Stats - Will be in left column on md+ */}
      <div className={`sf-card p-6 md:col-start-1 ${isComingSoon ? 'md:row-start-4' : 'md:row-start-3'} ${isComingSoon ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
              {t('boost.yourBalance', { token: vault.outputAsset })}
            </p>
            <p className="text-lg font-bold text-[color:var(--sf-text)]">
              {userVeTokenBalanceFormatted}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
              {t('boost.totalStaked', { token: vault.boostTokenSymbol || '' })}
            </p>
            <p className="text-lg font-bold text-[color:var(--sf-text)]">
              {totalVxTokenStaked}
            </p>
          </div>
        </div>

        {/* Stake/Unstake Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab("stake")}
            className={`sf-tab-underline-btn ${activeTab === "stake" ? "sf-tab-underline-btn--active" : ""}`}
          >
            {t('boost.stakeTab')}
          </button>
          <button
            onClick={() => setActiveTab("unstake")}
            className={`sf-tab-underline-btn ${activeTab === "unstake" ? "sf-tab-underline-btn--active" : ""}`}
          >
            {t('boost.unstakeTab')}
          </button>
        </div>

        {/* Stake Input - styled like From Wallet */}
        <div className="space-y-3">
          <div
            className="sf-input group relative z-20 p-4 cursor-text"
            onClick={() => inputRef.current?.focus()}
          >
            {/* Token display - floating top-right (non-selectable) */}
            <div className="absolute right-4 top-4 z-10">
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <TokenIcon
                  key={`boost-${vault.boostTokenSymbol}`}
                  symbol={vault.boostTokenSymbol || 'vxFIRE'}
                  id={vault.boostTokenId || vault.tokenId}
                  iconUrl={vault.boostIconPath}
                  size="sm"
                  network={network}
                />
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                  {vault.boostTokenSymbol}
                </span>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex flex-col gap-1">
              {/* Label */}
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">
                {activeTab === "stake" ? t('boost.stakeAmount') : t('boost.unstakeAmount')}
              </span>

              {/* Input - full width */}
              <div className="pr-32">
                <NumberField
                  ref={inputRef}
                  placeholder="0.00"
                  align="left"
                  value={stakeAmount}
                  onChange={setStakeAmount}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                />
              </div>

              {/* Balance + Percentage Buttons stacked */}
              <div className="flex flex-col items-end gap-1">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                  {t('boost.balance', { amount: userVeTokenBalanceFormatted })}
                </div>
                <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${inputFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setStakeAmount((parseFloat(userVeTokenBalance) * 0.25).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setStakeAmount((parseFloat(userVeTokenBalance) * 0.5).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setStakeAmount((parseFloat(userVeTokenBalance) * 0.75).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setStakeAmount(userVeTokenBalance)}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    {t('boost.max')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            disabled={isComingSoon}
            className="group relative w-full overflow-hidden rounded-xl px-6 py-3 font-bold text-white transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(to right, var(--sf-boost-icon-from), var(--sf-boost-icon-to))` }}
          >
            <span className="relative z-10">{activeTab === "stake" ? t('boost.stakeToBoost') : t('boost.unstakeTab')}</span>
            <div className="absolute inset-0 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-purple-300/40 to-transparent group-disabled:animate-none" />
          </button>
        </div>
      </div>

      {/* Positions list */}
      {vault.hasBoost && (showPositions || !isComingSoon) && (
        <div className="sf-card flex flex-col opacity-50 pointer-events-none">
          {/* Header */}
          <div className="sf-card-header">
            <h3 className="text-base font-bold text-[color:var(--sf-text)]">
              Boosted Positions (demo)
            </h3>
            <button className="sf-card-header-action">
              {t('boost.consolidateAll')}
            </button>
          </div>

          {/* Column headers */}
          <div className="sf-table-header grid grid-cols-3 gap-2 px-6 py-2.5">
            <div>dxBTC Amount</div>
            <div>vxFUEL Used</div>
            <div className="text-right">Boost Date</div>
          </div>

          {/* Rows */}
          <div className="overflow-auto no-scrollbar" style={{ maxHeight: 'calc(5 * 85px)' }}>
            {[
              { dxBtc: '250.50', vxFuel: '200', date: '01/15/2026' },
              { dxBtc: '1,000.00', vxFuel: '650', date: '01/22/2026' },
            ].map((row, i) => (
              <div key={i} className="sf-row grid grid-cols-3 items-center gap-2 px-6 py-4">
                <div className="text-sm font-bold text-[color:var(--sf-primary)]">{row.dxBtc}</div>
                <div className="text-sm font-bold text-purple-600">{row.vxFuel}</div>
                <div className="text-sm text-[color:var(--sf-primary)] text-right">{row.date}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
