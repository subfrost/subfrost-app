"use client";

import { useState } from "react";
import { VaultConfig } from "../constants";
import { TrendingUp, Lock, AlertCircle } from "lucide-react";

type Props = {
  vault: VaultConfig;
};

export default function BoostSection({ vault }: Props) {
  const [stakeAmount, setStakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");

  // Mock data - replace with real data
  const userVeTokenBalance = "1,250.50";
  const totalVxTokenStaked = "850.00";
  const baseApy = vault.estimatedApy || "0";
  const boostedApy = "7.8"; // Calculate based on boost
  const boostMultiplier = "1.5x";

  // Check if this is the special dxBTC vault with FROST
  const isComingSoon = vault.isBoostComingSoon;

  if (!vault.hasBoost) {
    return (
      <div className="rounded-2xl border-2 border-[color:var(--sf-outline)] bg-white/40 backdrop-blur-sm p-6">
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
    <div className="space-y-4">
      {/* Boost Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
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
        <div className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-1.5">
          <span className="text-sm font-bold text-white">{boostMultiplier}</span>
        </div>
      </div>

      {isComingSoon && (
        <div className="rounded-xl border-2 border-amber-500/30 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Lock size={18} />
            <span className="text-sm font-semibold">Coming Soon</span>
          </div>
          <p className="mt-1 text-xs text-amber-700">
            FROST token features are not yet available. Stay tuned for the TGE announcement!
          </p>
        </div>
      )}

      {/* APY Comparison */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border-2 border-[color:var(--sf-outline)] bg-white/60 p-4">
          <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
            Base APY
          </p>
          <p className="text-2xl font-bold text-[color:var(--sf-text)]">
            {baseApy}%
          </p>
        </div>
        <div className="rounded-xl border-2 border-purple-500/30 bg-gradient-to-br from-purple-50 to-pink-50 p-4">
          <p className="text-xs font-medium text-purple-700 mb-1">
            Boosted APY
          </p>
          <p className="text-2xl font-bold text-purple-600">
            {boostedApy}%
          </p>
        </div>
      </div>

      {/* Boost Stats */}
      <div className={`rounded-2xl border-2 border-[color:var(--sf-outline)] bg-white/40 backdrop-blur-sm p-6 ${isComingSoon ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
              Your {vault.outputAsset} Balance
            </p>
            <p className="text-lg font-bold text-[color:var(--sf-text)]">
              {userVeTokenBalance}
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
            className={`px-4 py-2 text-sm font-semibold transition-all relative ${
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
            className={`px-4 py-2 text-sm font-semibold transition-all relative ${
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

        {/* Stake Input */}
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="0.00"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              className="w-full rounded-xl border-2 border-[color:var(--sf-outline)] bg-white px-4 py-3 text-lg font-semibold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/30 focus:border-[color:var(--sf-primary)] focus:outline-none"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() => setStakeAmount(userVeTokenBalance)}
                className="text-xs font-bold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)]"
              >
                MAX
              </button>
              <span className="text-sm font-bold text-[color:var(--sf-text)]">
                {vault.boostTokenSymbol}
              </span>
            </div>
          </div>

          <button
            disabled={isComingSoon}
            className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 font-bold text-white transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activeTab === "stake" ? "Stake to Boost" : "Unstake"}
          </button>
        </div>
      </div>

      {/* Positions List (if has multiple positions) */}
      {vault.hasBoost && !isComingSoon && (
        <div className="rounded-2xl border-2 border-[color:var(--sf-outline)] bg-white/40 backdrop-blur-sm p-6">
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
            <div className="flex items-center justify-between rounded-lg bg-white/60 p-3">
              <div>
                <p className="text-xs text-[color:var(--sf-text)]/60">Position #1</p>
                <p className="text-sm font-bold text-[color:var(--sf-text)]">250.50 {vault.outputAsset}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[color:var(--sf-text)]/60">Boost</p>
                <p className="text-sm font-bold text-purple-600">200 {vault.boostTokenSymbol}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/60 p-3">
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
