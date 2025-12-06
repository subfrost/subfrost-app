"use client";

import { useState } from "react";
import NumberField from "@/app/components/NumberField";
import { useWallet } from "@/context/WalletContext";

type Props = {
  mode: 'deposit' | 'withdraw' | 'stake' | 'unstake';
  onModeChange: (mode: any) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  onExecute: () => void;
  onClaim?: () => void;
  balance: string;
  pendingRewards?: string;
  inputToken: string;
  outputToken: string;
  title: string;
};

export default function VaultActionPanel({
  mode,
  onModeChange,
  amount,
  onAmountChange,
  onExecute,
  onClaim,
  balance,
  pendingRewards = "0.00",
  inputToken,
  outputToken,
  title,
}: Props) {
  const { isConnected, onConnectModalOpenChange } = useWallet();
  
  const showDepositWithdraw = mode === 'deposit' || mode === 'withdraw';
  const showStakeUnstake = mode === 'stake' || mode === 'unstake';

  return (
    <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm sticky top-4">
      <h3 className="text-xl font-bold text-[color:var(--sf-text)] mb-6">{title}</h3>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-6">
        {showDepositWithdraw && (
          <>
            <button
              onClick={() => onModeChange('deposit')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                mode === 'deposit'
                  ? 'bg-[color:var(--sf-primary)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => onModeChange('withdraw')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                mode === 'withdraw'
                  ? 'bg-[color:var(--sf-primary)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Withdraw
            </button>
          </>
        )}
        {showStakeUnstake && (
          <>
            <button
              onClick={() => onModeChange('stake')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                mode === 'stake'
                  ? 'bg-[color:var(--sf-primary)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Stake
            </button>
            <button
              onClick={() => onModeChange('unstake')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                mode === 'unstake'
                  ? 'bg-[color:var(--sf-primary)] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Unstake
            </button>
          </>
        )}
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="text-xs font-semibold text-[color:var(--sf-text)]/70 mb-2 block">
          {mode === 'deposit' || mode === 'stake' ? 'Amount to ' + mode : 'Amount to ' + mode}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.00000001"
            placeholder="0.00"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            className="flex-1 h-12 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-4 text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] focus:outline-none"
          />
          <button
            onClick={() => onAmountChange(balance)}
            className="px-4 h-12 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition-colors"
          >
            MAX
          </button>
        </div>
        <div className="mt-2 text-xs text-[color:var(--sf-text)]/60">
          Available: {balance} {mode === 'withdraw' || mode === 'unstake' ? outputToken : inputToken}
        </div>
      </div>

      {/* Execute Button */}
      <button
        onClick={() => {
          if (!isConnected) {
            onConnectModalOpenChange(true);
            return;
          }
          onExecute();
        }}
        disabled={isConnected && (!amount || parseFloat(amount) <= 0)}
        className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)] mb-4"
      >
        {isConnected ? mode.toUpperCase() : 'CONNECT WALLET'}
      </button>

      {/* Claim Rewards */}
      {onClaim && parseFloat(pendingRewards) > 0 && (
        <div className="pt-4 border-t border-[color:var(--sf-outline)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[color:var(--sf-text)]/70">Pending Rewards</span>
            <span className="text-sm font-semibold text-[color:var(--sf-text)]">
              {pendingRewards} DIESEL
            </span>
          </div>
          <button
            onClick={onClaim}
            className="w-full rounded-lg bg-green-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-600"
          >
            CLAIM REWARDS
          </button>
        </div>
      )}
    </div>
  );
}
