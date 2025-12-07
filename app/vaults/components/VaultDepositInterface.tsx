"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/context/WalletContext";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import type { VaultUnit } from "@/hooks/useVaultUnits";
import { AVAILABLE_VAULTS, VaultConfig } from "../constants";
import { useFeeRate } from "@/hooks/useFeeRate";
import { ChevronDown } from "lucide-react";

// All available tokens that can be deposited into vaults
const ALL_VAULT_TOKENS: Array<{ id: string; symbol: string }> = [
  { id: 'btc', symbol: 'BTC' },
  { id: '32:0', symbol: 'frBTC' },
  { id: 'usd', symbol: 'bUSD' },
  { id: '2:0', symbol: 'DIESEL' },
  { id: 'eth_empty', symbol: 'frETH' },
  { id: '2:16', symbol: 'METHANE' },
  { id: 'frUSD', symbol: 'frUSD' },
  { id: 'zec_empty', symbol: 'frZEC' },
  { id: 'ordi', symbol: 'ORDI' },
];

// Get the corresponding vault for an input token
const getVaultForInputToken = (tokenId: string): VaultConfig | null => {
  const tokenToVaultMap: Record<string, string> = {
    'btc': 'dx-btc',       // BTC -> dxBTC
    '32:0': 'dx-btc',      // frBTC -> dxBTC (prioritize dxBTC over yvfrBTC)
    '2:16': 've-methane',  // METHANE -> veMETHANE
    '2:0': 've-diesel',    // DIESEL -> veDIESEL
    'usd': 've-usd',       // bUSD -> veUSD
    'frUSD': 've-usd',     // frUSD -> veUSD
    'zec_empty': 've-zec', // frZEC -> veZEC
    'eth_empty': 've-eth', // frETH -> veETH
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
    'veMETHANE': { id: '2:16', symbol: 'METHANE' },
    'veDIESEL': { id: '2:0', symbol: 'DIESEL' },
    'veUSD': { id: 'usd', symbol: 'bUSD' },
    'veZEC': { id: 'zec_empty', symbol: 'frZEC' },
    'veETH': { id: 'eth_empty', symbol: 'frETH' },
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
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const { selection, setSelection, custom, setCustom, feeRate, presets } = useFeeRate({ storageKey: 'subfrost-vault-fee-rate' });
  const selectorRef = useRef<HTMLDivElement>(null);

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
    <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-6 backdrop-blur-sm">
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
      </div>

      {mode === 'deposit' ? (
        /* Deposit Mode: Swap-like UI */
        <div className="relative flex flex-col gap-3">
          {/* From Wallet Panel */}
          <div className="relative z-30 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">From Wallet</span>
            <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
              <div className="flex flex-col gap-2">
                {/* Row 1: Input + Token Selector */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <NumberField placeholder={"0.00"} align="left" value={amount} onChange={setAmount} />
                  </div>
                  <div className="relative" ref={selectorRef}>
                    <button
                      type="button"
                      onClick={() => setShowTokenSelector(!showTokenSelector)}
                      className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 py-2 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-surface)] hover:shadow-md focus:outline-none flex-shrink-0"
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
                              className={`w-full px-4 py-3 text-left text-sm font-semibold transition-colors first:rounded-t-xl last:rounded-b-xl ${
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
                </div>
                
                {/* Row 2: Fiat + Balance */}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/50">$0.00</div>
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                    Balance {userBalance}
                  </div>
                </div>
                
                {/* Row 3: Percentage Buttons */}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat(userBalance) * 0.25).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all outline-none focus:outline-none border text-[color:var(--sf-primary)] ${activePercent === 0.25 ? "border-[color:var(--sf-primary)]/50 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"}`}
                  >
                    25%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat(userBalance) * 0.5).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all outline-none focus:outline-none border text-[color:var(--sf-primary)] ${activePercent === 0.5 ? "border-[color:var(--sf-primary)]/50 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"}`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount((parseFloat(userBalance) * 0.75).toString())}
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all outline-none focus:outline-none border text-[color:var(--sf-primary)] ${activePercent === 0.75 ? "border-[color:var(--sf-primary)]/50 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"}`}
                  >
                    75%
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount(userBalance)}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-all outline-none focus:outline-none border text-[color:var(--sf-primary)] ${activePercent === 1 ? "border-[color:var(--sf-primary)]/50 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"}`}
                  >
                    Max
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* To Vault Panel */}
          <div className="relative z-10 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">To Vault</span>
            <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <NumberField placeholder={"0.00"} align="left" value={amount} onChange={() => {}} disabled />
                <div className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 py-2">
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
                <div className="text-xs font-medium text-[color:var(--sf-text)]/50">$0.00</div>
                <div className="text-right text-xs font-medium text-[color:var(--sf-text)]/60">
                  APY {apy}%
                </div>
              </div>
            </div>
          </div>

          {/* Miner Fee Section */}
          <div className="relative z-[5] rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40 p-4 backdrop-blur-sm">
            <div>
              <div className="text-xs font-semibold text-[color:var(--sf-text)]/60 mb-1">Miner Fee:</div>
              <div className="flex items-center gap-2">
                {selection === 'custom' && setCustom ? (
                  <div className="relative w-40">
                    <input
                      aria-label="Custom miner fee rate"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="0"
                      className="h-9 w-full rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 pr-20 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">Sats / vByte</span>
                  </div>
                ) : (
                  <div className="text-sm font-bold text-[color:var(--sf-text)]">
                    {feeRate} Sats / vByte
                  </div>
                )}
                <div className="ml-auto">
                  <MinerFeeButton 
                    selection={selection}
                    setSelection={setSelection}
                    customFee={custom}
                    setCustomFee={setCustom}
                    feeRate={feeRate}
                    presets={presets}
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
            className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
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
            className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            {isConnected ? 'WITHDRAW' : 'CONNECT WALLET'}
          </button>
        </div>
      )}
    </div>
  );
}

// Miner Fee Button Component (copied from LiquidityInputs)
type MinerFeeButtonProps = {
  selection: any;
  setSelection?: (s: any) => void;
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

  const handleSelect = (s: any) => {
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
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/80 px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] backdrop-blur-sm transition-all hover:bg-[color:var(--sf-surface)] hover:border-[color:var(--sf-primary)]/30 hover:shadow-sm focus:outline-none"
      >
        <span>{getDisplayText()}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['slow', 'medium', 'fast', 'custom'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full px-3 py-2 text-left text-xs font-semibold capitalize transition-colors first:rounded-t-md last:rounded-b-md ${
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
