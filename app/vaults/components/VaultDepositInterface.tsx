"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import type { VaultUnit } from "@/hooks/useVaultUnits";
import { AVAILABLE_VAULTS, VaultConfig } from "../constants";
import { useFeeRate } from "@/hooks/useFeeRate";
import type { FeeSelection } from "@/hooks/useFeeRate";
import { useGlobalStore } from "@/stores/global";
import type { SlippageSelection } from "@/stores/global";
import { ChevronDown } from "lucide-react";

// All available tokens that can be deposited into vaults
const ALL_VAULT_TOKENS: Array<{ id: string; symbol: string }> = [
  { id: 'btc', symbol: 'BTC' },
  { id: '32:0', symbol: 'frBTC' },
  { id: 'usd', symbol: 'bUSD' },
  { id: '2:0', symbol: 'DIESEL' },
  { id: 'frUSD', symbol: 'frUSD' },
  { id: 'ordi', symbol: 'ORDI' },
];

// Get the corresponding vault for an input token
const getVaultForInputToken = (tokenId: string): VaultConfig | null => {
  const tokenToVaultMap: Record<string, string> = {
    'btc': 'dx-btc',       // BTC -> dxBTC
    '32:0': 'dx-btc',      // frBTC -> dxBTC (prioritize dxBTC over yvfrBTC)
    '2:0': 've-diesel',    // DIESEL -> veDIESEL
    'usd': 've-usd',       // bUSD -> veUSD
    'frUSD': 've-usd',     // frUSD -> veUSD
    'ordi': 've-ordi',     // ORDI -> veORDI
  };
  
  const vaultId = tokenToVaultMap[tokenId];
  if (!vaultId) return null;
  
  return AVAILABLE_VAULTS.find(v => v.id === vaultId) || null;
};

// Get the initial input token for a vault (first supported token)
const getInitialInputTokenForVault = (vault: VaultConfig): { id: string; symbol: string } => {
  // Map of output asset to default input token
  const defaultInputMap: Record<string, { id: string; symbol: string }> = {
    'dxBTC': { id: 'btc', symbol: 'BTC' },
    'veDIESEL': { id: '2:0', symbol: 'DIESEL' },
    'veUSD': { id: 'usd', symbol: 'bUSD' },
    'yvfrBTC': { id: '32:0', symbol: 'frBTC' },
    'veORDI': { id: 'ordi', symbol: 'ORDI' },
  };
  
  return defaultInputMap[vault.outputAsset] || { id: vault.tokenId, symbol: vault.inputAsset };
};

type Props = {
  mode: 'deposit' | 'withdraw';
  onModeChange: (mode: 'deposit' | 'withdraw') => void;
  vault: VaultConfig;
  onVaultChange: (vault: VaultConfig) => void;
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
  vault,
  onVaultChange,
  userBalance,
  apy,
  onExecute,
  vaultUnits = [],
  selectedUnitId = '',
  onUnitSelect = () => {},
}: Props) {
  const [amount, setAmount] = useState("");
  const [selectedInputToken, setSelectedInputToken] = useState<{ id: string; symbol: string }>(
    getInitialInputTokenForVault(vault)
  );
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  // Single state to track which settings field is focused (only one can be focused at a time)
  const [focusedField, setFocusedField] = useState<'deadline' | 'slippage' | 'fee' | null>(null);
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const { selection: feeSelection, setSelection: setFeeSelection, custom: customFee, setCustom: setCustomFee, feeRate, presets: feePresets } = useFeeRate({ storageKey: 'subfrost-vault-fee-rate' });
  const { maxSlippage, setMaxSlippage, slippageSelection, setSlippageSelection, deadlineBlocks, setDeadlineBlocks } = useGlobalStore();
  // Local deadline state to allow empty field while typing
  const [deadlineLocal, setDeadlineLocal] = useState(String(deadlineBlocks));
  const selectorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canExecute = mode === 'deposit' 
    ? (isConnected && amount && parseFloat(amount) > 0)
    : (isConnected && selectedUnitId !== '');

  // Check if current amount matches a specific percentage of balance
  const getActivePercent = (): number | null => {
    if (!amount || !userBalance) return null;
    
    const balance = parseFloat(userBalance);
    const amountNum = parseFloat(amount);
    
    if (!balance || balance === 0 || !amountNum) return null;
    
    const tolerance = 0.0001;
    if (Math.abs(amountNum - balance * 0.25) < tolerance) return 0.25;
    if (Math.abs(amountNum - balance * 0.5) < tolerance) return 0.5;
    if (Math.abs(amountNum - balance * 0.75) < tolerance) return 0.75;
    if (Math.abs(amountNum - balance) < tolerance) return 1;
    
    return null;
  };

  const activePercent = getActivePercent();

  // Close token selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setShowTokenSelector(false);
      }
    };

    if (showTokenSelector) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTokenSelector]);

  // Update selected input token when vault changes
  useEffect(() => {
    setSelectedInputToken(getInitialInputTokenForVault(vault));
  }, [vault.id]);

  const handleInputTokenSelect = (token: { id: string; symbol: string }) => {
    setSelectedInputToken(token);
    setShowTokenSelector(false);
    
    // Find the corresponding vault for this input token
    const newVault = getVaultForInputToken(token.id);
    if (newVault && newVault.id !== vault.id) {
      // Reset amount when switching vaults
      setAmount('');
      onVaultChange(newVault);
    }
  };

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 sm:p-9 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => onModeChange('deposit')}
          className={`pb-3 px-1 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
            mode === 'deposit'
              ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
          }`}
        >
          Deposit
        </button>
        <button
          onClick={() => onModeChange('withdraw')}
          className={`pb-3 px-1 text-sm font-semibold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
            mode === 'withdraw'
              ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
          }`}
        >
          Withdraw
        </button>
      </div>

      {mode === 'deposit' ? (
        /* Deposit Mode: Swap-like UI */
        <div className="relative flex flex-col gap-3">
          {/* From Wallet Panel */}
          <div
            className={`relative z-30 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[400ms] cursor-text ${inputFocused ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}
            onClick={() => inputRef.current?.focus()}
          >
            {/* Token Selector - floating top-right */}
            <div className="absolute right-4 top-4 z-10" ref={selectorRef} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setShowTokenSelector(!showTokenSelector)}
                className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none"
              >
                <TokenIcon
                  key={`selected-${selectedInputToken.id}-${selectedInputToken.symbol}`}
                  symbol={selectedInputToken.symbol}
                  id={selectedInputToken.id}
                  size="sm"
                  network={network}
                />
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                  {selectedInputToken.symbol}
                </span>
                <ChevronDown size={16} className="text-[color:var(--sf-text)]/60 flex-shrink-0" />
              </button>

              {/* Token Selector Dropdown */}
              {showTokenSelector && (
                <div className="absolute right-0 mt-2 z-[100] w-56 rounded-xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl max-h-80 overflow-y-auto">
                  {ALL_VAULT_TOKENS.map((token) => {
                    const tokenVault = getVaultForInputToken(token.id);
                    return (
                      <button
                        key={token.id}
                        type="button"
                        onClick={() => handleInputTokenSelect(token)}
                        className={`w-full px-4 py-3 text-left text-sm font-semibold transition-all duration-[400ms] first:rounded-t-xl last:rounded-b-xl ${
                          selectedInputToken.id === token.id
                            ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                            : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <TokenIcon
                            symbol={token.symbol}
                            id={token.id}
                            size="sm"
                            network={network}
                          />
                          <div className="flex-1">
                            <div className="font-semibold">{token.symbol}</div>
                            {tokenVault && (
                              <div className="text-[10px] text-[color:var(--sf-text)]/50">
                                → {tokenVault.outputAsset}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Main content area */}
            <div className="flex flex-col gap-1">
              {/* Label */}
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">From Wallet</span>

              {/* Input - full width */}
              <div className="pr-32">
                <NumberField
                  ref={inputRef}
                  placeholder={"0.00"}
                  align="left"
                  value={amount}
                  onChange={setAmount}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                />
              </div>

              {/* Fiat value + Percentage Buttons row */}
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/50">$0.00</div>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat(userBalance) * 0.25).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-[400ms] outline-none focus:outline-none border text-[color:var(--sf-percent-btn)] ${activePercent === 0.25 ? "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10"}`}
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat(userBalance) * 0.5).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-[400ms] outline-none focus:outline-none border text-[color:var(--sf-percent-btn)] ${activePercent === 0.5 ? "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10"}`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat(userBalance) * 0.75).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all duration-[400ms] outline-none focus:outline-none border text-[color:var(--sf-percent-btn)] ${activePercent === 0.75 ? "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10"}`}
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount(userBalance)}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-all duration-[400ms] outline-none focus:outline-none border text-[color:var(--sf-percent-btn)] ${activePercent === 1 ? "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10"}`}
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Balance row at bottom */}
              <div className="flex items-center justify-end">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                  Balance {userBalance}
                </div>
              </div>
            </div>
          </div>

          {/* To Vault Panel */}
          <div className="relative z-10 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            {/* Token display - floating top-right */}
            <div className="absolute right-4 top-4 z-10">
              <div className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <TokenIcon
                  key={`vault-${vault.id}-${vault.outputAsset}`}
                  symbol={vault.outputAsset}
                  id={vault.tokenId}
                  iconUrl={vault.iconPath}
                  size="sm"
                  network={network}
                />
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                  {vault.outputAsset}
                </span>
              </div>
            </div>

            {/* Main content area */}
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">To Vault</span>
              <div className="pr-32">
                <NumberField placeholder={"0.00"} align="left" value={amount} onChange={() => {}} disabled />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/50">$0.00</div>
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                  APY {apy}%
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Settings */}
          <div className="relative z-[5] rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 text-sm shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] ">
            <div className="flex flex-col gap-2.5">
              {/* Minimum Received row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  Minimum Received
                </span>
                <span className="font-semibold text-[color:var(--sf-text)]">
                  {amount ? amount : '0.00'} {vault.outputAsset}
                </span>
              </div>

              {/* Deadline (blocks) row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  Deadline (blocks)
                </span>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      aria-label="Transaction deadline in blocks"
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={deadlineLocal}
                      onChange={(e) => setDeadlineLocal(e.target.value)}
                      onFocus={() => setFocusedField('deadline')}
                      onBlur={() => {
                        setFocusedField(null);
                        const val = parseInt(deadlineLocal, 10);
                        if (!deadlineLocal || isNaN(val) || val < 1) {
                          setDeadlineLocal('3');
                          setDeadlineBlocks(3);
                        } else {
                          setDeadlineBlocks(Math.min(100, val));
                        }
                      }}
                      placeholder="3"
                      style={{ outline: 'none', border: 'none' }}
                      className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-sm font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'deadline' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Slippage Tolerance row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  Slippage Tolerance
                </span>
                <div className="flex items-center gap-2">
                  {slippageSelection === 'custom' ? (
                    <div className="relative">
                      <input
                        aria-label="Custom slippage tolerance"
                        type="text"
                        inputMode="numeric"
                        value={maxSlippage}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d{0,2}$/.test(val)) {
                            const num = parseInt(val, 10);
                            if (val === '' || (num >= 0 && num <= 99)) {
                              setMaxSlippage(val);
                            }
                          }
                        }}
                        onFocus={() => setFocusedField('slippage')}
                        onBlur={() => {
                          setFocusedField(null);
                          if (!maxSlippage) {
                            setMaxSlippage('5');
                          }
                        }}
                        placeholder="5"
                        style={{ outline: 'none', border: 'none' }}
                        className={`h-7 w-14 rounded-lg bg-[color:var(--sf-input-bg)] px-2 pr-5 text-sm font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'slippage' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">%</span>
                    </div>
                  ) : (
                    <span className="font-semibold text-[color:var(--sf-text)]">
                      {maxSlippage}%
                    </span>
                  )}
                  <SlippageButton
                    selection={slippageSelection}
                    setSelection={setSlippageSelection}
                    setValue={setMaxSlippage}
                  />
                </div>
              </div>

              {/* Miner Fee Rate row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  Miner Fee Rate (sats/vB)
                </span>
                <div className="flex items-center gap-2">
                  {feeSelection === 'custom' && setCustomFee ? (
                    <div className="relative">
                      <input
                        aria-label="Custom miner fee rate"
                        type="number"
                        min={1}
                        max={999}
                        step={1}
                        value={customFee}
                        onChange={(e) => setCustomFee(e.target.value)}
                        onFocus={() => setFocusedField('fee')}
                        onBlur={() => {
                          setFocusedField(null);
                          if (!customFee) {
                            setCustomFee(String(feePresets.medium));
                          }
                        }}
                        placeholder="0"
                        style={{ outline: 'none', border: 'none' }}
                        className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-sm font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ${focusedField === 'fee' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                      />
                    </div>
                  ) : (
                    <span className="font-semibold text-[color:var(--sf-text)]">
                      {Math.round(feeRate)}
                    </span>
                  )}
                  <MinerFeeButton
                    selection={feeSelection}
                    setSelection={setFeeSelection}
                    customFee={customFee}
                    setCustomFee={setCustomFee}
                    feeRate={feeRate}
                    presets={feePresets}
                  />
                </div>
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
            className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02]  active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            {isConnected ? 'DEPOSIT' : 'CONNECT WALLET'}
          </button>
        </div>
      ) : (
        /* Withdraw Mode: Unit Selection */
        <div className="space-y-4 mb-6">
          <div>
            <label className="text-xs font-bold text-[color:var(--sf-text)] mb-2 block">
              Select vault unit to redeem
            </label>
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
                      className={`w-full p-3 rounded-lg border transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none  ${
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
          </div>

          {/* Withdraw Button */}
          <button
            onClick={() => {
              if (!isConnected) {
                onConnectModalOpenChange(true);
                return;
              }
              onExecute('1'); // Vault units are typically 1 per deposit
            }}
            disabled={!canExecute}
            className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02]  active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            {isConnected ? 'WITHDRAW' : 'CONNECT WALLET'}
          </button>
        </div>
      )}
    </div>
  );
}

// Miner Fee Button Component
type MinerFeeButtonProps = {
  selection: FeeSelection;
  setSelection?: (s: FeeSelection) => void;
  customFee: string;
  setCustomFee?: (v: string) => void;
  feeRate: number;
  presets: { slow: number; medium: number; fast: number };
};

function MinerFeeButton({ selection, setSelection, presets }: MinerFeeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (s: FeeSelection) => {
    if (setSelection) setSelection(s);
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (selection === 'custom') return 'Custom';
    return selection.charAt(0).toUpperCase() + selection.slice(1);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all duration-[400ms] focus:outline-none ${isOpen ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
      >
        <span>{getDisplayText()}</span>
        <ChevronDown size={12} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold capitalize transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{option}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {presets[option as keyof typeof presets]}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Slippage Button Component
const SLIPPAGE_PRESETS: Record<Exclude<SlippageSelection, 'custom'>, string> = {
  low: '1',
  medium: '5',
  high: '10',
};

type SlippageButtonProps = {
  selection: SlippageSelection;
  setSelection: (s: SlippageSelection) => void;
  setValue: (v: string) => void;
};

function SlippageButton({ selection, setSelection, setValue }: SlippageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (s: SlippageSelection) => {
    setSelection(s);
    if (s !== 'custom') {
      setValue(SLIPPAGE_PRESETS[s]);
    }
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (selection === 'custom') return 'Custom';
    return selection.charAt(0).toUpperCase() + selection.slice(1);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all duration-[400ms] focus:outline-none ${isOpen ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
      >
        <span>{getDisplayText()}</span>
        <ChevronDown size={12} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['low', 'medium', 'high', 'custom'] as SlippageSelection[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold capitalize transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                selection === option
                  ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                  : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{option}</span>
                {option !== 'custom' && (
                  <span className="text-[10px] text-[color:var(--sf-text)]/50">
                    {SLIPPAGE_PRESETS[option]}%
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
