"use client";

import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import type { TokenMeta } from "../types";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useModalStore } from "@/stores/modals";
import { useGlobalStore } from "@/stores/global";
import type { SlippageSelection } from "@/stores/global";
import { ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { FeeSelection } from "@/hooks/useFeeRate";
import { useTranslation } from '@/hooks/useTranslation';

type LPPosition = {
  id: string;                    // LP token alkane ID (same as pool ID)
  token0Symbol: string;
  token1Symbol: string;
  token0Id?: string;             // Token 0 alkane ID (for remove liquidity)
  token1Id?: string;             // Token 1 alkane ID (for remove liquidity)
  amount: string;                // LP token balance (display units)
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
  onRemoveLiquidity?: () => void;
  isLoading?: boolean;
  isRemoveLoading?: boolean;
  token0BalanceText?: string;
  token1BalanceText?: string;
  token0FiatText?: string;
  token1FiatText?: string;
  onPercentToken0?: (percent: number) => void;
  onPercentToken1?: (percent: number) => void;
  minimumToken0?: string;
  minimumToken1?: string;
  feeRate?: number;
  feeSelection?: FeeSelection;
  setFeeSelection?: (s: FeeSelection) => void;
  customFee?: string;
  setCustomFee?: (v: string) => void;
  feePresets?: { slow: number; medium: number; fast: number };
  liquidityMode?: 'provide' | 'remove';
  onModeChange?: (mode: 'provide' | 'remove') => void;
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
  onRemoveLiquidity,
  isLoading = false,
  isRemoveLoading = false,
  token0BalanceText = "No balance",
  token1BalanceText = "No balance",
  token0FiatText = "$0.00",
  token1FiatText = "$0.00",
  onPercentToken0,
  onPercentToken1,
  minimumToken0,
  minimumToken1,
  feeRate = 0,
  feeSelection = 'medium',
  setFeeSelection,
  customFee = '',
  setCustomFee,
  feePresets = { slow: 2, medium: 8, fast: 25 },
  liquidityMode = 'provide',
  onModeChange,
  selectedLPPosition,
  onSelectLPPosition,
  onOpenLPSelector,
  removeAmount = '',
  onChangeRemoveAmount,
  summary,
}: Props) {
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const { theme } = useTheme();
  const { openTokenSelector } = useModalStore();
  const { t } = useTranslation();
  const { maxSlippage, setMaxSlippage, slippageSelection, setSlippageSelection, deadlineBlocks, setDeadlineBlocks } = useGlobalStore();

  // Calculate active percentage for token inputs
  const getActivePercent = (amount: string, balanceText: string): number | null => {
    if (!amount || !balanceText) return null;
    const balanceMatch = balanceText.match(/[\d.]+/);
    if (!balanceMatch) return null;
    const balance = parseFloat(balanceMatch[0]);
    const value = parseFloat(amount);
    if (!balance || balance === 0 || !value) return null;
    const tolerance = 0.0001;
    if (Math.abs(value - balance * 0.25) < tolerance) return 0.25;
    if (Math.abs(value - balance * 0.5) < tolerance) return 0.5;
    if (Math.abs(value - balance * 0.75) < tolerance) return 0.75;
    if (Math.abs(value - balance) < tolerance) return 1;
    return null;
  };

  const activePercentToken0 = getActivePercent(token0Amount, token0BalanceText);
  const activePercentToken1 = getActivePercent(token1Amount, token1BalanceText);

  // Single state to track which settings field is focused (only one can be focused at a time)
  const [focusedField, setFocusedField] = useState<'deadline' | 'slippage' | 'fee' | null>(null);
  // Local deadline state to allow empty field while typing
  const [deadlineLocal, setDeadlineLocal] = useState(String(deadlineBlocks));

  const canAddLiquidity = isConnected &&
    !!token0Amount && !!token1Amount &&
    isFinite(parseFloat(token0Amount)) && isFinite(parseFloat(token1Amount)) &&
    parseFloat(token0Amount) > 0 && parseFloat(token1Amount) > 0 &&
    !!token0 && !!token1;

  const canRemoveLiquidity = isConnected &&
    !!selectedLPPosition &&
    !!removeAmount &&
    parseFloat(removeAmount) > 0 &&
    parseFloat(removeAmount) <= parseFloat(selectedLPPosition.amount);

  // Dynamic CTA text and handler based on mode
  const getCtaText = () => {
    if (!isConnected) return t('liquidity.connectWallet');
    if (liquidityMode === 'remove') {
      return isRemoveLoading ? t('liquidity.removingLiquidity') : t('liquidity.removeLiquidity');
    }
    return isLoading ? t('liquidity.addingLiquidity') : t('liquidity.addLiquidity');
  };

  const ctaText = getCtaText();

  const onCtaClick = () => {
    if (!isConnected) {
      onConnectModalOpenChange(true);
      return;
    }
    if (liquidityMode === 'remove' && onRemoveLiquidity) {
      onRemoveLiquidity();
    } else {
      onAddLiquidity();
    }
  };

  return (
    <>
      {/* Add/Remove Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => onModeChange?.('provide')}
          className={`pb-3 px-1 text-sm font-semibold ${
            liquidityMode === 'provide'
              ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
          }`}
        >
          {t('liquidity.add')}
        </button>
        <button
          onClick={() => onModeChange?.('remove')}
          className={`pb-3 px-1 text-sm font-semibold ${
            liquidityMode === 'remove'
              ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
          }`}
        >
          {t('liquidity.remove')}
        </button>
      </div>

      <div className="relative flex flex-col gap-3">
        {liquidityMode === 'remove' ? (
        /* Remove Mode: LP Position Selector */
        <>
          <div className="relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              {t('liquidity.selectLpPosition')}
            </span>
            <button
              type="button"
              onClick={onOpenLPSelector}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none"
            >
              <span className="font-bold text-sm text-[color:var(--sf-text)]">
                {selectedLPPosition ? `${selectedLPPosition.amount} ${selectedLPPosition.token0Symbol}/${selectedLPPosition.token1Symbol} LP` : t('liquidity.selectPosition')}
              </span>
              <ChevronDown size={16} className="text-[color:var(--sf-text)]/60" />
            </button>
          </div>

          {/* Remove Amount Input */}
          {selectedLPPosition && (
            <>
              <div className="relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md">
                <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('liquidity.amountToRemove')}</span>
                <div className="rounded-xl bg-[color:var(--sf-input-bg)] p-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
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
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none outline-none focus:outline-none border text-[color:var(--sf-percent-btn)] ${isActive ? "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-primary)]/20" : "border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-primary)]/10"}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Transaction Details - Same style as SwapSummary */}
              <div className="relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 text-sm shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
                <div className="flex flex-col gap-2.5">
                  {/* Minimum Received row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                      {t('liquidity.minimumReceived')}
                    </span>
                    <span className="font-semibold text-[color:var(--sf-text)]">
                      {selectedLPPosition.token0Symbol} / {selectedLPPosition.token1Symbol}
                    </span>
                  </div>

                  {/* Deadline (blocks) row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                      {t('swapSummary.deadlineBlocks')}
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
                          style={{ outline: 'none', border: focusedField === 'deadline' ? '1px solid rgba(91,156,255,0.5)' : '1px solid transparent' }}
                          className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 transition-all duration-300 ${focusedField === 'deadline' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Slippage Tolerance row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                      {t('swapSummary.slippageTolerance')}
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
                            style={{ outline: 'none', border: focusedField === 'slippage' ? '1px solid rgba(91,156,255,0.5)' : '1px solid transparent' }}
                            className={`h-7 w-14 rounded-lg bg-[color:var(--sf-input-bg)] px-2 pr-5 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 transition-all duration-300 ${focusedField === 'slippage' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
                      {t('swapSummary.minerFeeRate')}
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
                            style={{ outline: 'none', border: focusedField === 'fee' ? '1px solid rgba(91,156,255,0.5)' : '1px solid transparent' }}
                            className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 transition-all duration-300 ${focusedField === 'fee' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
            </>
          )}
        </>
      ) : (
        /* Provide Mode: Token Pair Selection */
        <>
          {/* Select Pair Panel */}
          <div className="relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              {t('liquidity.selectPair')}
            </span>
            
            {/* Side-by-side token selectors */}
            <div className="flex flex-row md:flex-col lg:flex-row items-center md:items-start lg:items-center gap-3">
              {/* Token 0 selector + divider row */}
              <div className="contents md:flex md:items-center md:gap-3 lg:contents">
                <button
                  type="button"
                  onClick={() => openTokenSelector('pool0')}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none"
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
                    {token0?.symbol ?? t('liquidity.selectToken')}
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
                className="flex-1 md:flex-none lg:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none"
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
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
              <div className="mb-2 flex items-center gap-2">
                <TokenIcon
                  symbol={token0.symbol}
                  id={token0.id}
                  iconUrl={token0.iconUrl}
                  size="sm"
                  network={network}
                />
                <span className="text-xs font-bold text-white">{token0.symbol}</span>
              </div>
              <div className="rounded-xl bg-[color:var(--sf-input-bg)] p-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
                <NumberField placeholder={"0.00"} align="left" value={token0Amount} onChange={onChangeToken0Amount} />
                <div className="mt-1 flex flex-col items-end gap-1">
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/60">{token0BalanceText}</div>
                  {onPercentToken0 && (
                    <div className="flex items-center gap-1">
                      {[
                        { label: '25%', value: 0.25 },
                        { label: '50%', value: 0.5 },
                        { label: '75%', value: 0.75 },
                      ].map(({ label, value }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => onPercentToken0(value)}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercentToken0 === value ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onPercentToken0(1)}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercentToken0 === 1 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                      >
                        Max
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Token 1 Amount Input */}
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
              <div className="mb-2 flex items-center gap-2">
                <TokenIcon
                  symbol={token1.symbol}
                  id={token1.id}
                  iconUrl={token1.iconUrl}
                  size="sm"
                  network={network}
                />
                <span className="text-xs font-bold text-white">{token1.symbol}</span>
              </div>
              <div className="rounded-xl bg-[color:var(--sf-input-bg)] p-2 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
                <NumberField placeholder={"0.00"} align="left" value={token1Amount} onChange={onChangeToken1Amount} />
                <div className="mt-1 flex flex-col items-end gap-1">
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/60">{token1BalanceText}</div>
                  {onPercentToken1 && (
                    <div className="flex items-center gap-1">
                      {[
                        { label: '25%', value: 0.25 },
                        { label: '50%', value: 0.5 },
                        { label: '75%', value: 0.75 },
                      ].map(({ label, value }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => onPercentToken1(value)}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercentToken1 === value ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => onPercentToken1(1)}
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercentToken1 === 1 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                      >
                        Max
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Transaction Details - Same style as SwapSummary */}
          <div className="relative z-10 rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 text-sm shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]">
            <div className="flex flex-col gap-2.5">
              {/* Minimum Received row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  Minimum Received
                </span>
                <span className="font-semibold text-[color:var(--sf-text)]">
                  {minimumToken0 || (token0.id === 'btc' || token0.symbol === 'frBTC' ? '0.00000000' : '0.00')} {token0.symbol} / {minimumToken1 || (token1.id === 'btc' || token1.symbol === 'frBTC' ? '0.00000000' : '0.00')} {token1.symbol}
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
                      style={{ outline: 'none', border: focusedField === 'deadline' ? '1px solid rgba(91,156,255,0.5)' : '1px solid transparent' }}
                          className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 transition-all duration-300 ${focusedField === 'deadline' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
                    />
                  </div>
                </div>
              </div>

              {/* Slippage Tolerance row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  {t('swapSummary.slippageTolerance')}
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
                        style={{ outline: 'none', border: focusedField === 'slippage' ? '1px solid rgba(91,156,255,0.5)' : '1px solid transparent' }}
                            className={`h-7 w-14 rounded-lg bg-[color:var(--sf-input-bg)] px-2 pr-5 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 transition-all duration-300 ${focusedField === 'slippage' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
                  {t('swapSummary.minerFeeRate')}
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
                        style={{ outline: 'none', border: focusedField === 'fee' ? '1px solid rgba(91,156,255,0.5)' : '1px solid transparent' }}
                            className={`h-7 w-16 rounded-lg bg-[color:var(--sf-input-bg)] px-2 text-base font-semibold text-[color:var(--sf-text)] text-center !outline-none !ring-0 focus:!outline-none focus:!ring-0 transition-all duration-300 ${focusedField === 'fee' ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)]'}`}
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
          disabled={
            (liquidityMode === 'remove'
              ? (!canRemoveLiquidity && isConnected) || isRemoveLoading
              : (!canAddLiquidity && isConnected) || isLoading)
          }
          className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          {ctaText}
        </button>
      </div>
    </>
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
  const { t } = useTranslation();

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

  const feeDisplayMap: Record<FeeSelection, string> = {
    slow: t('liquidity.slow'),
    medium: t('liquidity.medium'),
    fast: t('liquidity.fast'),
    custom: t('liquidity.custom'),
  };

  const getDisplayText = () => {
    return feeDisplayMap[selection] || selection;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] focus:outline-none"
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
  const { t } = useTranslation();

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

  const slippageDisplayMap: Record<string, string> = {
    low: t('liquidity.slow'),
    medium: t('liquidity.medium'),
    high: t('liquidity.fast'),
    custom: t('liquidity.custom'),
  };

  const getDisplayText = () => {
    return slippageDisplayMap[selection] || selection;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--sf-input-bg)] px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] focus:outline-none"
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
