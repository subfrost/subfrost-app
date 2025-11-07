"use client";

import { useState } from "react";
import { useWallet } from "@/context/WalletContext";

type Props = {
  mode: 'deposit' | 'withdraw';
  onModeChange: (mode: 'deposit' | 'withdraw') => void;
  inputToken: string;
  outputToken: string;
  tokenId: string; // Alkane ID like "2:0"
  userBalance: string;
  apy: string;
  onExecute: () => void;
};

export default function VaultDepositInterface({
  mode,
  onModeChange,
  inputToken,
  outputToken,
  tokenId,
  userBalance,
  apy,
  onExecute,
}: Props) {
  const [amount, setAmount] = useState("");
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const tokenImageUrl = `https://asset.oyl.gg/alkanes/${network}/${tokenId.replace(/:/g, '-')}.png`;

  const canExecute = isConnected && amount && parseFloat(amount) > 0;

  return (
    <div className="rounded-xl border border-[color:var(--sf-outline)] bg-white/60 p-6 backdrop-blur-sm flex-1">
      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-[color:var(--sf-outline)]">
        <button
          onClick={() => onModeChange('deposit')}
          className={`pb-3 px-1 text-sm font-semibold transition-colors ${
            mode === 'deposit'
              ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => onModeChange('withdraw')}
          className={`pb-3 px-1 text-sm font-semibold transition-colors ${
            mode === 'withdraw'
              ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
          }`}
        >
          Withdraw
        </button>

        {/* Settings icon on right */}
        <button className="ml-auto text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] transition-colors">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      {/* Vertical Layout */}
      <div className="space-y-4 mb-6">
        {/* From wallet */}
        <div>
          <label className="text-xs font-bold text-[color:var(--sf-text)] mb-2 block">
            From wallet
          </label>
          <button className="w-full h-12 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 flex items-center gap-2 hover:bg-gray-50 transition-colors">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#A8C5E8] to-[#7AA8D8] overflow-hidden">
              <img 
                src={tokenImageUrl} 
                alt={inputToken}
                className="h-5 w-5 object-contain"
                style={{
                  filter: 'brightness(0.9) saturate(1.2) hue-rotate(15deg)',
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = '<span class="text-xs text-white font-bold">D</span>';
                }}
              />
            </div>
            <span className="text-sm font-bold text-[color:var(--sf-text)]">{inputToken}</span>
          </button>
          <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
            You have {userBalance} {inputToken}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="text-xs font-bold text-[color:var(--sf-text)] mb-2 block">
            Amount
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.00000001"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-12 rounded-lg border border-[color:var(--sf-outline)] bg-white px-3 text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] sf-focus-ring"
            />
            <button
              onClick={() => setAmount(userBalance)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 transition-colors"
            >
              Max
            </button>
          </div>
          <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
            $0.00
          </div>
        </div>

        {/* To vault info */}
        <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-gray-50">
          <div>
            <div className="text-xs font-bold text-[color:var(--sf-text)] mb-1">To vault</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)]">{outputToken}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[color:var(--sf-text)]/60">APY</div>
            <div className="text-lg font-bold text-green-600">{apy}%</div>
          </div>
        </div>

        {/* You will receive */}
        <div>
          <label className="text-xs font-bold text-[color:var(--sf-text)] mb-2 block">
            You will receive
          </label>
          <div className="w-full h-12 rounded-lg border border-[color:var(--sf-outline)] bg-gray-50 px-3 flex items-center text-sm text-[color:var(--sf-text)]">
            {amount || '0'}
          </div>
          <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
            $0.00
          </div>
        </div>
      </div>

      {/* Deposit Button */}
      <button
        onClick={() => {
          if (!isConnected) {
            onConnectModalOpenChange(true);
            return;
          }
          onExecute();
        }}
        disabled={!canExecute}
        className="w-full rounded-lg bg-[color:var(--sf-primary)] py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isConnected ? mode.toUpperCase() : 'CONNECT WALLET'}
      </button>
    </div>
  );
}
