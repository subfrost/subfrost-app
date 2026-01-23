"use client";

import { useState, useRef } from "react";
import { VaultConfig } from "../constants";
import { TrendingUp, Lock, AlertCircle } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@/context/WalletContext";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";

type Props = {
  vault: VaultConfig;
};

export default function BoostSection({ vault }: Props) {
  const [stakeAmount, setStakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const { network } = useWallet();

  // Mock data - replace with real data
  const userVeTokenBalance = "1250.50";
  const userVeTokenBalanceFormatted = "1,250.50";
  const totalVxTokenStaked = "850.00";
  const baseApy = vault.estimatedApy || "0";
  const multiplier = vault.boostMultiplier || 1.5;
  const boostedApy = (parseFloat(baseApy) * multiplier).toFixed(1);
  const boostMultiplier = `${multiplier}x`;

  // Check if this is the special dxBTC vault with FUEL
  const isComingSoon = vault.isBoostComingSoon;

  if (!vault.hasBoost) {
    return (
      <div className="rounded-2xl bg-[color:var(--sf-surface)]/40 backdrop-blur-sm p-6 border-t border-[color:var(--sf-top-highlight)]">
        <div className="flex items-center gap-3 text-[color:var(--sf-text)]/60">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">
            This vault does not support yield boosting.
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
              BOOST Your Yield
            </h3>
            <p className="text-xs text-[color:var(--sf-text)]/60">
              Stake {vault.boostTokenSymbol} to increase your APY
            </p>
          </div>
        </div>

        {/* Boost Multiplier Badge */}
        <div 
          className="rounded-full px-4 py-1.5"
          style={{ background: `linear-gradient(to right, var(--sf-boost-icon-from), var(--sf-boost-icon-to))` }}
        >
          <span className="text-sm font-bold text-white">{boostMultiplier}</span>
        </div>
      </div>

      {isComingSoon && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-[color:var(--sf-coming-soon-bg)] p-4 md:col-span-2 md:row-start-2">
          <div className="flex items-center gap-2 text-[color:var(--sf-coming-soon-title)]">
            <Lock size={18} />
            <span className="text-sm font-semibold">Coming Soon</span>
          </div>
          <p className="mt-1 text-xs text-[color:var(--sf-coming-soon-text)]">
            FUEL token features are not yet available. We will make announcements when TGE plans are finalized.
          </p>
        </div>
      )}

      {/* APY Comparison - Grid on mobile, split columns on md+ */}
      <div className="grid grid-cols-2 gap-4 md:contents">
        <div className={`rounded-xl bg-[color:var(--sf-surface)]/60 p-4 md:col-start-1 border-t border-[color:var(--sf-top-highlight)] ${isComingSoon ? 'md:row-start-3' : 'md:row-start-2'}`}>
          <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
            Est. Base APY
          </p>
          <p className="text-2xl font-bold text-[color:var(--sf-text)]">
            {baseApy}%
          </p>
        </div>
        <div 
          className={`rounded-xl border-2 border-purple-500/30 p-4 md:col-start-2 ${isComingSoon ? 'md:row-start-3' : 'md:row-start-2'}`}
          style={{ background: `linear-gradient(to bottom right, var(--sf-boost-bg-from), var(--sf-boost-bg-to))` }}
        >
          <p className="text-xs font-medium text-[color:var(--sf-boost-label)] mb-1">
            Boosted APY
          </p>
          <p className="text-2xl font-bold text-[color:var(--sf-boost-value)]">
            {boostedApy}%
          </p>
        </div>
      </div>

      {/* Boost Stats - Will be in left column on md+ */}
      <div className={`rounded-2xl bg-[color:var(--sf-surface)]/40 backdrop-blur-sm p-6 md:col-start-1 border-t border-[color:var(--sf-top-highlight)] ${isComingSoon ? 'md:row-start-4' : 'md:row-start-3'} ${isComingSoon ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
              Your {vault.outputAsset} Balance
            </p>
            <p className="text-lg font-bold text-[color:var(--sf-text)]">
              {userVeTokenBalanceFormatted}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
              Total {vault.boostTokenSymbol} Staked
            </p>
            <p className="text-lg font-bold text-[color:var(--sf-text)]">
              {totalVxTokenStaked}
            </p>
          </div>
        </div>

        {/* Stake/Unstake Tabs */}
        <div className="flex gap-2 mb-4 border-b border-[color:var(--sf-outline)]">
          <button
            onClick={() => setActiveTab("stake")}
            className={`px-4 py-2 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none relative ${
              activeTab === "stake"
                ? "text-[color:var(--sf-primary)]"
                : "text-[color:var(--sf-text)]/60"
            }`}
          >
            Stake
            {activeTab === "stake" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[color:var(--sf-primary)]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("unstake")}
            className={`px-4 py-2 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none relative ${
              activeTab === "unstake"
                ? "text-[color:var(--sf-primary)]"
                : "text-[color:var(--sf-text)]/60"
            }`}
          >
            Unstake
            {activeTab === "unstake" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[color:var(--sf-primary)]" />
            )}
          </button>
        </div>

        {/* Stake Input - styled like From Wallet */}
        <div className="space-y-3">
          <div
            className={`relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[400ms] cursor-text ${inputFocused ? 'shadow-[0_0_14px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}
            onClick={() => inputRef.current?.focus()}
          >
            {/* Token display - floating top-right (non-selectable) */}
            <div className="absolute right-4 top-4 z-10">
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <TokenIcon
                  key={`boost-${vault.boostTokenSymbol}`}
                  symbol={vault.boostTokenSymbol || 'vxDIESEL'}
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
                {activeTab === "stake" ? "Stake Amount" : "Unstake Amount"}
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
                  Balance {userVeTokenBalanceFormatted}
                </div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setStakeAmount((parseFloat(userVeTokenBalance) * 0.25).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setStakeAmount((parseFloat(userVeTokenBalance) * 0.5).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setStakeAmount((parseFloat(userVeTokenBalance) * 0.75).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setStakeAmount(userVeTokenBalance)}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}
                  >
                    Max
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            disabled={isComingSoon}
            className="group relative w-full overflow-hidden rounded-xl px-6 py-3 font-bold text-white transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: `linear-gradient(to right, var(--sf-boost-icon-from), var(--sf-boost-icon-to))` }}
          >
            <span className="relative z-10">{activeTab === "stake" ? "Stake to Boost" : "Unstake"}</span>
            <div className="absolute inset-0 animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-purple-300/40 to-transparent group-disabled:animate-none" />
          </button>
        </div>
      </div>

      {/* Positions List (if has multiple positions) - Will be in left column on md+ */}
      {vault.hasBoost && !isComingSoon && (
        <div className="rounded-2xl bg-[color:var(--sf-surface)]/40 backdrop-blur-sm p-6 md:col-start-1 md:row-start-4 border-t border-[color:var(--sf-top-highlight)]">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-[color:var(--sf-text)]">
              Your Boosted Positions
            </h4>
            <button className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)]">
              Consolidate All
            </button>
          </div>

          {/* Mock positions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-[color:var(--sf-surface)]/60 p-3">
              <div>
                <p className="text-xs text-[color:var(--sf-text)]/60">Position #1</p>
                <p className="text-sm font-bold text-[color:var(--sf-text)]">250.50 {vault.outputAsset}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[color:var(--sf-text)]/60">Boost</p>
                <p className="text-sm font-bold text-purple-600">200 {vault.boostTokenSymbol}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-[color:var(--sf-surface)]/60 p-3">
              <div>
                <p className="text-xs text-[color:var(--sf-text)]/60">Position #2</p>
                <p className="text-sm font-bold text-[color:var(--sf-text)]">1,000.00 {vault.outputAsset}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[color:var(--sf-text)]/60">Boost</p>
                <p className="text-sm font-bold text-purple-600">650 {vault.boostTokenSymbol}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
