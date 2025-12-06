"use client";

import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import type { TokenMeta } from "../types";
import { useWallet } from "@/context/WalletContext";
import { useModalStore } from "@/stores/modals";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { FeeSelection } from "@/hooks/useFeeRate";

type LPPosition = {
  id: string;
  token0Symbol: string;
  token1Symbol: string;
  amount: string;
  valueUSD: number;
  gainLoss: {
    token0: { amount: string; symbol: string };
    token1: { amount: string; symbol: string };
  };
};

type Props = {
  token0?: TokenMeta;
  token1?: TokenMeta;
  token0Options: TokenMeta[];
  token1Options: TokenMeta[];
  token0Amount: string;
  token1Amount: string;
  onChangeToken0Amount: (v: string) => void;
  onChangeToken1Amount: (v: string) => void;
  onSelectToken0?: (id: string) => void;
  onSelectToken1?: (id: string) => void;
  onAddLiquidity: () => void;
  token0BalanceText?: string;
  token1BalanceText?: string;
  token0FiatText?: string;
  token1FiatText?: string;
  minimumToken0?: string;
  minimumToken1?: string;
  feeRate?: number;
  feeSelection?: FeeSelection;
  setFeeSelection?: (s: FeeSelection) => void;
  customFee?: string;
  setCustomFee?: (v: string) => void;
  feePresets?: { slow: number; medium: number; fast: number };
  liquidityMode?: 'provide' | 'remove';
  selectedLPPosition?: LPPosition | null;
  onSelectLPPosition?: (position: LPPosition | null) => void;
  onOpenLPSelector?: () => void;
  removeAmount?: string;
  onChangeRemoveAmount?: (v: string) => void;
  summary?: React.ReactNode;
};

export type { LPPosition };

export default function LiquidityInputs({
  token0,
  token1,
  token0Options,
  token1Options,
  token0Amount,
  token1Amount,
  onChangeToken0Amount,
  onChangeToken1Amount,
  onSelectToken0,
  onSelectToken1,
  onAddLiquidity,
  token0BalanceText = "No balance",
  token1BalanceText = "No balance",
  token0FiatText = "$0.00",
  token1FiatText = "$0.00",
  minimumToken0,
  minimumToken1,
  feeRate = 0,
  feeSelection = 'medium',
  setFeeSelection,
  customFee = '',
  setCustomFee,
  feePresets = { slow: 2, medium: 8, fast: 25 },
  liquidityMode = 'provide',
  selectedLPPosition,
  onSelectLPPosition,
  onOpenLPSelector,
  removeAmount = '',
  onChangeRemoveAmount,
  summary,
}: Props) {
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const { openTokenSelector } = useModalStore();

  
  const canAddLiquidity = isConnected &&
    !!token0Amount && !!token1Amount &&
    isFinite(parseFloat(token0Amount)) && isFinite(parseFloat(token1Amount)) &&
    parseFloat(token0Amount) > 0 && parseFloat(token1Amount) > 0 &&
    !!token0 && !!token1;
  
  const ctaText = isConnected ? "ADD LIQUIDITY" : "CONNECT WALLET";
  
  const onCtaClick = () => {
    if (!isConnected) {
      onConnectModalOpenChange(true);
      return;
    }
    onAddLiquidity();
  };

  return (
    <>
      <div className="relative flex flex-col gap-3">
        {liquidityMode === 'remove' ? (
        /* Remove Mode: LP Position Selector */
        <>
          <div className="relative z-20 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              Select LP Position to Remove
            </span>
            <button
              type="button"
              onClick={onOpenLPSelector}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-4 py-3 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-surface)] hover:shadow-md focus:outline-none"
            >
              <span className="font-bold text-sm text-[color:var(--sf-text)]">
                {selectedLPPosition ? `${selectedLPPosition.amount} ${selectedLPPosition.token0Symbol}/${selectedLPPosition.token1Symbol} LP` : 'Select Position'}
              </span>
              <ChevronDown size={16} className="text-[color:var(--sf-text)]/60" />
            </button>
          </div>

          {/* Remove Amount Input */}
          {selectedLPPosition && (
            <>
              <div className="relative z-20 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md">
                <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">Amount to Remove</span>
                <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
                  <div className="flex flex-col gap-2">
                    {/* Row 1: Input */}
                    <NumberField 
                      placeholder="0.00" 
                      align="left" 
                      value={removeAmount} 
                      onChange={onChangeRemoveAmount || (() => {})} 
                    />
                    
                    {/* Row 2: USD Value + Balance */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[color:var(--sf-text)]/50">
                        ${selectedLPPosition.valueUSD}
                      </span>
                      <span className="font-medium text-[color:var(--sf-text)]/60">
                        Balance: {selectedLPPosition.amount}
                      </span>
                    </div>
                    
                    {/* Row 3: Percentage Buttons */}
                    <div className="flex items-center justify-end gap-1.5">
                      {[
                        { label: '25%', value: 0.25 },
                        { label: '50%', value: 0.5 },
                        { label: '75%', value: 0.75 },
                        { label: 'Max', value: 1 },
                      ].map(({ label, value }) => {
                        const targetAmount = (parseFloat(selectedLPPosition.amount) * value).toString();
                        const isActive = removeAmount && Math.abs(parseFloat(removeAmount) - parseFloat(targetAmount)) < 0.0001;
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => onChangeRemoveAmount?.(targetAmount)}
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-all outline-none focus:outline-none border text-[color:var(--sf-primary)] ${isActive ? "border-[color:var(--sf-primary)]/50 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* LP Details - Swap Summary Style */}
              <div className="relative z-20 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/60 p-4 text-sm backdrop-blur-sm transition-all">
                {/* Header row - LP Details title + Settings button */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">LP Details</span>
                  <SettingsButton />
                </div>

                <div className="flex flex-col gap-2.5">
                  {/* VALUE row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-primary)]">
                      Value
                    </span>
                    <span className="font-semibold text-[color:var(--sf-primary)]">
                      ${selectedLPPosition.valueUSD}
                    </span>
                  </div>

                  {/* GAIN/LOSS row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                      Gain/Loss
                    </span>
                    <span className="font-semibold text-[color:var(--sf-text)]">
                      <span className={selectedLPPosition.gainLoss.token0.amount.startsWith('+') ? 'text-green-600' : 'text-red-600'}>
                        {selectedLPPosition.gainLoss.token0.amount} {selectedLPPosition.gainLoss.token0.symbol}
                      </span>
                      {' / '}
                      <span className={selectedLPPosition.gainLoss.token1.amount.startsWith('+') ? 'text-green-600' : 'text-red-600'}>
                        {selectedLPPosition.gainLoss.token1.amount} {selectedLPPosition.gainLoss.token1.symbol}
                      </span>
                    </span>
                  </div>

                  {/* Miner Fee Rate - bottom row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                      Miner Fee Rate
                    </span>
                    <span className="font-semibold text-[color:var(--sf-text)]">
                      {feeRate} sats/vB
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* Provide Mode: Token Pair Selection */
        <>
          {/* Select Pair Panel */}
          <div className="relative z-20 rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              Select Pair to Provide
            </span>
            
            {/* Side-by-side token selectors */}
            <div className="flex flex-row md:flex-col lg:flex-row items-center md:items-start lg:items-center gap-3">
              {/* Token 0 selector + divider row */}
              <div className="contents md:flex md:items-center md:gap-3 lg:contents">
                <button
                  type="button"
                  onClick={() => openTokenSelector('pool0')}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-4 py-3 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-surface)] hover:shadow-md focus:outline-none"
                >
                  {token0 && (
                    <TokenIcon 
                      key={`pool0-${token0.id}-${token0.symbol}`} 
                      symbol={token0.symbol} 
                      id={token0.id} 
                      iconUrl={token0.iconUrl} 
                      size="sm" 
                      network={network} 
                    />
                  )}
                  <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                    {token0?.symbol ?? 'Select Token'}
                  </span>
                  <ChevronDown size={16} className="text-[color:var(--sf-text)]/60" />
                </button>

                {/* Divider - visible only on medium screens (with token0) */}
                <span className="hidden md:block lg:hidden text-xl font-bold text-[color:var(--sf-text)]/40">/</span>
              </div>

              {/* Divider - visible on small and large screens (between selectors) */}
              <span className="md:hidden lg:block text-xl font-bold text-[color:var(--sf-text)]/40">/</span>

              {/* Token 1 selector */}
              <button
                type="button"
                onClick={() => openTokenSelector('pool1')}
                className="flex-1 md:flex-none lg:flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-4 py-3 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-surface)] hover:shadow-md focus:outline-none"
              >
                {token1 && (
                  <TokenIcon 
                    key={`pool1-${token1.id}-${token1.symbol}`} 
                    symbol={token1.symbol} 
                    id={token1.id} 
                    iconUrl={token1.iconUrl} 
                    size="sm" 
                    network={network} 
                  />
                )}
                <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
                  {token1?.symbol ?? 'BTC'}
                </span>
                <ChevronDown size={16} className="text-[color:var(--sf-text)]/60" />
              </button>
            </div>
      </div>

          {/* Token Amount Inputs - Side by Side */}
          {token0 && token1 && (
            <>
              <div className="relative z-20 grid grid-cols-2 gap-3">
            {/* Token 0 Amount Input */}
            <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
              <div className="mb-2 flex items-center gap-2">
                <TokenIcon 
                  symbol={token0.symbol} 
                  id={token0.id} 
                  iconUrl={token0.iconUrl} 
                  size="sm" 
                  network={network} 
                />
                <span className="text-xs font-bold text-[color:var(--sf-text)]">{token0.symbol}</span>
              </div>
              <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-2 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
                <NumberField placeholder={"0.00"} align="left" value={token0Amount} onChange={onChangeToken0Amount} />
                <div className="mt-1 text-right text-xs font-medium text-[color:var(--sf-text)]/60">{token0BalanceText}</div>
              </div>
            </div>

            {/* Token 1 Amount Input */}
            <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
              <div className="mb-2 flex items-center gap-2">
                <TokenIcon 
                  symbol={token1.symbol} 
                  id={token1.id} 
                  iconUrl={token1.iconUrl} 
                  size="sm" 
                  network={network} 
                />
                <span className="text-xs font-bold text-[color:var(--sf-text)]">{token1.symbol}</span>
              </div>
              <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-2 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
                <NumberField placeholder={"0.00"} align="left" value={token1Amount} onChange={onChangeToken1Amount} />
                <div className="mt-1 text-right text-xs font-medium text-[color:var(--sf-text)]/60">{token1BalanceText}</div>
              </div>
            </div>
          </div>

          {/* Fee Component */}
          <div className="relative z-10 rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40 p-4 backdrop-blur-sm">
            {/* Minimum Received with Settings Button */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold text-[color:var(--sf-text)]/60">Minimum Received:</div>
                <SettingsButton />
              </div>
              <div className="text-sm font-bold text-[color:var(--sf-text)]">
                {minimumToken0 || (token0.id === 'btc' || token0.symbol === 'frBTC' ? '0.00000000' : '0.00')} {token0.symbol} / {minimumToken1 || (token1.id === 'btc' || token1.symbol === 'frBTC' ? '0.00000000' : '0.00')} {token1.symbol}
              </div>
            </div>

            {/* Miner Fee */}
            <div>
              <div className="text-xs font-semibold text-[color:var(--sf-text)]/60 mb-1">Miner Fee:</div>
              <div className="flex items-center gap-2">
                {feeSelection === 'custom' && setCustomFee ? (
                  <div className="relative w-40">
                    <input
                      aria-label="Custom miner fee rate"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={customFee}
                      onChange={(e) => setCustomFee(e.target.value)}
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

              {/* Summary */}
              {summary && (
                <div className="relative z-10">
                  {summary}
                </div>
              )}
            </>
          )}
        </>
      )}

        {/* CTA */}
        <button
          type="button"
          onClick={onCtaClick}
          disabled={!canAddLiquidity && isConnected}
          className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          {ctaText}
        </button>
      </div>
    </>
  );
}

function SettingsButton() {
  const { openTxSettings } = useModalStore();
  return (
    <button
      type="button"
      onClick={() => openTxSettings()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/80 px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] backdrop-blur-sm transition-all hover:bg-[color:var(--sf-surface)] hover:border-[color:var(--sf-primary)]/30 hover:shadow-sm focus:outline-none"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Settings</span>
    </button>
  );
}

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
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/80 px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] backdrop-blur-sm transition-all hover:bg-[color:var(--sf-surface)] hover:border-[color:var(--sf-primary)]/30 hover:shadow-sm focus:outline-none"
      >
        <span>{getDisplayText()}</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-50 w-32 rounded-lg border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          {(['slow', 'medium', 'fast', 'custom'] as FeeSelection[]).map((option) => (
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
