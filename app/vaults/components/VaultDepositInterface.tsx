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
  onExecute: (amount: string) => void;
  vaultUnits?: Array<{ alkaneId: string; amount: string; utxoCount: number }>;
  selectedUnitId?: string;
  onUnitSelect?: (unitId: string) => void;
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
  vaultUnits = [],
  selectedUnitId = '',
  onUnitSelect = () => {},
}: Props) {
  const [amount, setAmount] = useState("");
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const tokenImageUrl = `https://asset.oyl.gg/alkanes/${network}/${tokenId.replace(/:/g, '-')}.png`;

  const canExecute = mode === 'deposit' 
    ? (isConnected && amount && parseFloat(amount) > 0)
    : (isConnected && selectedUnitId !== '');

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
            {mode === 'deposit' ? 'From wallet' : 'Select vault unit to redeem'}
          </label>
          
          {mode === 'deposit' ? (
            <>
              <button className="w-full h-12 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 flex items-center gap-2 hover:bg-gray-50 transition-colors">
                <TokenIcon 
                  symbol={inputToken}
                  id={tokenId}
                  size="sm"
                  network={network}
                />
                <span className="text-sm font-bold text-[color:var(--sf-text)]">{inputToken}</span>
              </button>
              <div className="mt-1 text-xs text-[color:var(--sf-text)]/60">
                You have {userBalance} {inputToken}
              </div>
            </>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {vaultUnits.length === 0 ? (
                  <div className="text-sm text-[color:var(--sf-text)]/60 text-center py-4">
                    No vault units found. Deposit first to receive vault units.
                  </div>
                ) : (
                  vaultUnits.map((unit) => (
                    <button
                      key={unit.alkaneId}
                      onClick={() => onUnitSelect(unit.alkaneId)}
                      className={`w-full p-3 rounded-lg border transition-all ${
                        selectedUnitId === unit.alkaneId
                          ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                          : 'border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-left">
                          <div className="text-sm font-bold text-[color:var(--sf-text)]">
                            Unit #{unit.alkaneId.split(':')[1]}
                          </div>
                          <div className="text-xs text-[color:var(--sf-text)]/60">
                            Amount: {unit.amount}
                          </div>
                        </div>
                        {selectedUnitId === unit.alkaneId && (
                          <svg className="h-5 w-5 text-[color:var(--sf-primary)]" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Amount (only for deposit mode) */}
        {mode === 'deposit' && (
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
        )}

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
          onExecute(amount);
        }}
        disabled={!canExecute}
        className="w-full rounded-lg bg-[color:var(--sf-primary)] py-3.5 text-sm font-bold text-white shadow-sm transition-colors hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isConnected ? mode.toUpperCase() : 'CONNECT WALLET'}
      </button>
    </div>
  );
}
