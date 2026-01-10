"use client";

import { useState, useEffect, useRef } from "react";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import type { TokenMeta } from "../types";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useModalStore } from "@/stores/modals";
import { ChevronDown } from "lucide-react";
import ActivateBridge from "./ActivateBridge";

type BridgeStep = 1 | 2 | 3 | 4 | 5;

type Props = {
  from?: TokenMeta;
  to?: TokenMeta;
  fromOptions: TokenMeta[];
  toOptions: TokenMeta[];
  fromAmount: string;
  toAmount: string;
  onChangeFromAmount: (v: string) => void;
  onChangeToAmount: (v: string) => void;
  onSelectFromToken?: (symbol: string) => void;
  onSelectToToken?: (symbol: string) => void;
  onInvert: () => void;
  onSwapClick: () => void;
  fromBalanceText?: string; // e.g., "Balance 8.908881"
  toBalanceText?: string;
  fromFiatText?: string; // e.g., "$0.00"
  toFiatText?: string;
  onMaxFrom?: () => void; // optional Max action
  onPercentFrom?: (percent: number) => void; // optional percentage action (0.25, 0.5, 0.75)
  summary?: React.ReactNode;
  ethereumAddress?: string;
  onChangeEthereumAddress?: (v: string) => void;
};

export default function SwapInputs({
  from,
  to,
  fromOptions,
  toOptions,
  fromAmount,
  toAmount,
  onChangeFromAmount,
  onChangeToAmount,
  onSelectFromToken,
  onSelectToToken,
  onInvert,
  onSwapClick,
  fromBalanceText = "No balance",
  toBalanceText = "No balance",
  fromFiatText = "$0.00",
  toFiatText = "$0.00",
  onMaxFrom,
  onPercentFrom,
  summary,
  ethereumAddress,
  onChangeEthereumAddress,
}: Props) {
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const { theme } = useTheme();
  const { openTokenSelector } = useModalStore();

  // Refs for focusing inputs when clicking the container
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);

  // Track which input is focused for glow effect
  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const [ethAddressFocused, setEthAddressFocused] = useState(false);

  // Bridge state
  const [bridgeActive, setBridgeActive] = useState(false);
  const [bridgeStep, setBridgeStep] = useState<BridgeStep>(1);
  const [completedSteps, setCompletedSteps] = useState<BridgeStep[]>([]);

  // Bridge tokens don't have on-chain balances
  const BRIDGE_TOKEN_IDS = ['usdt', 'eth', 'sol', 'zec'];
  const isFromBridgeToken = from?.id ? BRIDGE_TOKEN_IDS.includes(from.id) : false;
  const isToBridgeToken = to?.id ? BRIDGE_TOKEN_IDS.includes(to.id) : false;

  // Deposit address for cross-chain swaps
  const DEPOSIT_ADDRESS = "0x59f57b84d6742acdaa56e9da1c770898e4a270b6";

  // For testing: allow cross-chain swap button to work even without full pricing
  const canSwapCrossChain = isConnected && isFromBridgeToken && !!fromAmount && parseFloat(fromAmount) > 0;
  const canSwap = isConnected &&
    !!fromAmount && !!toAmount &&
    isFinite(parseFloat(fromAmount)) && isFinite(parseFloat(toAmount)) &&
    parseFloat(fromAmount) > 0 && parseFloat(toAmount) > 0;

  // Enable button for cross-chain FROM tokens even without full quote
  const isButtonEnabled = canSwap || canSwapCrossChain;

  const ctaText = isConnected
    ? (isToBridgeToken || isFromBridgeToken ? "CONFIRM CROSS-CHAIN SWAP" : "CONFIRM SWAP")
    : "CONNECT WALLET";

  const onCtaClick = () => {
    if (!isConnected) {
      onConnectModalOpenChange(true);
      return;
    }

    // If FROM token is a bridge token, activate the bridge UI
    if (isFromBridgeToken) {
      setBridgeActive(true);
      setBridgeStep(1);
      setCompletedSteps([]);
      // Don't call onSwapClick for bridge tokens - we handle it differently
      return;
    }

    onSwapClick();
  };

  // Reset bridge state when tokens change
  useEffect(() => {
    setBridgeActive(false);
    setBridgeStep(1);
    setCompletedSteps([]);
  }, [from?.id, to?.id]);

  // Demo: simulate step progression for testing (remove in production)
  useEffect(() => {
    if (!bridgeActive) return;

    const stepTimers: NodeJS.Timeout[] = [];

    // Simulate step progression for demo purposes
    stepTimers.push(setTimeout(() => {
      setCompletedSteps([1]);
      setBridgeStep(2);
    }, 5000));

    stepTimers.push(setTimeout(() => {
      setCompletedSteps([1, 2]);
      setBridgeStep(3);
    }, 10000));

    stepTimers.push(setTimeout(() => {
      setCompletedSteps([1, 2, 3]);
      setBridgeStep(4);
    }, 15000));

    stepTimers.push(setTimeout(() => {
      setCompletedSteps([1, 2, 3, 4]);
      setBridgeStep(5);
    }, 20000));

    stepTimers.push(setTimeout(() => {
      setCompletedSteps([1, 2, 3, 4, 5]);
    }, 22000));

    return () => {
      stepTimers.forEach(clearTimeout);
    };
  }, [bridgeActive]);

  // Calculate balance usage percentage
  const calculateBalanceUsage = (): number => {
    if (!fromAmount || !fromBalanceText) return 0;

    // Extract balance from text like "Balance 8.908881"
    const balanceMatch = fromBalanceText.match(/[\d.]+/);
    if (!balanceMatch) return 0;

    const balance = parseFloat(balanceMatch[0]);
    const amount = parseFloat(fromAmount);

    if (!balance || balance === 0 || !amount) return 0;

    const percentage = (amount / balance) * 100;
    return Math.min(100, Math.max(0, percentage)); // Clamp between 0-100
  };

  const balanceUsage = calculateBalanceUsage();

  // Color based on usage
  const getBalanceColor = () => {
    const isDark = theme === 'dark';
    if (balanceUsage === 0) return isDark ? 'bg-gray-700' : 'bg-gray-200';
    if (balanceUsage < 50) return isDark ? 'bg-green-700' : 'bg-green-500';
    if (balanceUsage < 80) return isDark ? 'bg-yellow-700' : 'bg-yellow-500';
    if (balanceUsage < 100) return isDark ? 'bg-orange-700' : 'bg-orange-500';
    return isDark ? 'bg-red-700' : 'bg-red-500';
  };

  // Check if current amount matches a specific percentage of balance
  const getActivePercent = (): number | null => {
    if (!fromAmount || !fromBalanceText) return null;

    const balanceMatch = fromBalanceText.match(/[\d.]+/);
    if (!balanceMatch) return null;

    const balance = parseFloat(balanceMatch[0]);
    const amount = parseFloat(fromAmount);

    if (!balance || balance === 0 || !amount) return null;

    const tolerance = 0.0001; // Small tolerance for floating point comparison
    if (Math.abs(amount - balance * 0.25) < tolerance) return 0.25;
    if (Math.abs(amount - balance * 0.5) < tolerance) return 0.5;
    if (Math.abs(amount - balance * 0.75) < tolerance) return 0.75;
    if (Math.abs(amount - balance) < tolerance) return 1;

    return null;
  };

  const activePercent = getActivePercent();

  return (
    <div className="relative flex flex-col gap-3">
      {/* Collapsible swap inputs container - slides up when bridge is active */}
      <div
        className={`flex flex-col gap-3 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          bridgeActive
            ? "max-h-0 opacity-0 -translate-y-full pointer-events-none overflow-hidden"
            : "max-h-[1000px] opacity-100 translate-y-0 overflow-visible"
        }`}
      >
        {/* You Send - entire panel clickable to focus input */}
        <div
          className={`relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[400ms] cursor-text ${fromFocused ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}
          onClick={() => fromInputRef.current?.focus()}
        >
          {/* Token Selector - floating top-right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTokenSelector('from');
            }}
            className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none z-10"
          >
            {from && (
              <TokenIcon
                key={`from-${from.id}-${from.symbol}`}
                symbol={from.symbol}
                id={from.id}
                iconUrl={from.iconUrl}
                size="sm"
                network={network}
              />
            )}
            <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
              {from?.symbol ?? 'Select'}
            </span>
            <ChevronDown size={16} className="text-[color:var(--sf-text)]/60 flex-shrink-0" />
          </button>

          {/* Main content area */}
          <div className="flex flex-col gap-1">
            {/* Label */}
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">You Send</span>

            {/* Input - full width */}
            <div className="pr-32">
              <NumberField
                ref={fromInputRef}
                placeholder={"0.00"}
                align="left"
                value={fromAmount}
                onChange={onChangeFromAmount}
                onFocus={() => setFromFocused(true)}
                onBlur={() => setFromFocused(false)}
              />
            </div>

            {/* Fiat value + Percentage Buttons row */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-[color:var(--sf-text)]/50">{fromFiatText}</div>
              {/* Percentage Buttons (hidden for bridge tokens) */}
              {!isFromBridgeToken && (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  {onPercentFrom && (
                    <>
                      <button
                        type="button"
                        onClick={() => onPercentFrom(0.25)}
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 0.25 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                      >
                        25%
                      </button>
                      <button
                        type="button"
                        onClick={() => onPercentFrom(0.5)}
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 0.5 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => onPercentFrom(0.75)}
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 0.75 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`}`}
                      >
                        75%
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={onMaxFrom}
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${onMaxFrom ? (activePercent === 1 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-white/[0.06]`) : "opacity-40 cursor-not-allowed"}`}
                    disabled={!onMaxFrom}
                  >
                    Max
                  </button>
                </div>
              )}
            </div>

            {/* Balance row at bottom (hidden for bridge tokens) */}
            {!isFromBridgeToken && (
              <div className="flex items-center justify-end gap-2">
                {balanceUsage > 0 && (
                  <div className={`w-16 h-1 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                    <div
                      className={`h-full ${getBalanceColor()} transition-all duration-[400ms]`}
                      style={{ width: `${balanceUsage}%` }}
                    />
                  </div>
                )}
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                  {fromBalanceText}
                  {balanceUsage > 0 && (
                    <span className="ml-1.5">({balanceUsage.toFixed(1)}%)</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invert button – centered between cards */}
        <div className="relative -my-1 z-20 flex items-center justify-center">
          <button
            type="button"
            onClick={onInvert}
            className="group flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.25)] hover:scale-105 active:scale-95 outline-none"
            aria-label="Invert swap direction"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none group-hover:-rotate-180">
              <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* You Receive - entire panel clickable to focus input */}
        <div
          className={`relative z-20 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[400ms] cursor-text ${toFocused ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}
          onClick={() => toInputRef.current?.focus()}
        >
          {/* Token Selector - floating top-right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTokenSelector('to');
            }}
            className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] hover:bg-white/[0.06] focus:outline-none z-10"
          >
            {to && (
              <TokenIcon
                key={`to-${to.id}-${to.symbol}`}
                symbol={to.symbol}
                id={to.id}
                iconUrl={to.iconUrl}
                size="sm"
                network={network}
              />
            )}
            <span className="font-bold text-sm text-[color:var(--sf-text)] whitespace-nowrap">
              {to?.symbol ?? 'Select'}
            </span>
            <ChevronDown size={16} className="text-[color:var(--sf-text)]/60 flex-shrink-0" />
          </button>

          {/* Main content area */}
          <div className="flex flex-col gap-1">
            {/* Label */}
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">You Receive</span>

            {/* Input - full width */}
            <div className="pr-32">
              <NumberField
                ref={toInputRef}
                placeholder={"0.00"}
                align="left"
                value={toAmount}
                onChange={onChangeToAmount}
                onFocus={() => setToFocused(true)}
                onBlur={() => setToFocused(false)}
              />
            </div>

            {/* Fiat value */}
            <div className="text-xs font-medium text-[color:var(--sf-text)]/50">{toFiatText}</div>

            {/* Balance row at bottom (hidden for bridge tokens) */}
            {!isToBridgeToken && (
              <div className="flex items-center justify-end">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">{to?.id ? toBalanceText : 'Balance 0'}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary - hidden when bridge is active */}
      <div
        className={`relative z-20 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          bridgeActive
            ? "max-h-0 opacity-0 -translate-y-4 pointer-events-none overflow-hidden"
            : "max-h-[500px] opacity-100 translate-y-0"
        }`}
      >
        {summary}
      </div>

      {/* Ethereum Wallet Address for cross-chain tokens (when sending TO bridge token) */}
      {isToBridgeToken && !bridgeActive && (
        <div className={`relative z-10 rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md transition-shadow duration-[400ms] ${ethAddressFocused ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}>
          <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
            Ethereum Wallet Address
          </label>
          <input
            type="text"
            value={ethereumAddress ?? ''}
            onChange={(e) => onChangeEthereumAddress?.(e.target.value)}
            onFocus={() => setEthAddressFocused(true)}
            onBlur={() => setEthAddressFocused(false)}
            placeholder="Enter USDT recipient address (0x...)"
            className="w-full rounded-xl bg-[color:var(--sf-input-bg)] px-4 py-3 shadow-[0_2px_12px_rgba(0,0,0,0.08)] text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 !outline-none !ring-0 focus:!ring-0 focus:!outline-none focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms]"
          />
          <p className="mt-2 text-xs text-[color:var(--sf-text)]/50">
            Enter the Ethereum address where you want to receive USDT.
          </p>
        </div>
      )}

      {/* ActivateBridge component - grows up from button area when active */}
      <ActivateBridge
        isVisible={bridgeActive}
        amount={fromAmount}
        tokenSymbol={from?.symbol ?? "USDT"}
        depositAddress={DEPOSIT_ADDRESS}
        currentStep={bridgeStep}
        completedSteps={completedSteps}
      />

      {/* CTA Button - slides down when bridge is active */}
      <div
        className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          bridgeActive
            ? "max-h-0 opacity-0 translate-y-full pointer-events-none mt-0 overflow-hidden"
            : "max-h-20 opacity-100 translate-y-0 mt-2"
        }`}
      >
        <button
          type="button"
          onClick={onCtaClick}
          disabled={!isButtonEnabled && isConnected}
          className="h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
        >
          {ctaText}
        </button>
      </div>
    </div>
  );
}
