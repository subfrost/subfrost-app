"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import type { TokenMeta } from "../types";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useModalStore } from "@/stores/modals";
import { ChevronDown } from "lucide-react";
import ActivateBridge from "./ActivateBridge";
import BridgeDepositFlow from "./BridgeDepositFlow";
import type { BridgeDirection } from "./BridgeDepositFlow";
import { useTranslation } from "@/hooks/useTranslation";

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
  isSwapping?: boolean;
  fromBalanceText?: string; // e.g., "Balance 8.908881"
  toBalanceText?: string;
  fromFiatText?: string; // e.g., "$0.00"
  toFiatText?: string;
  isQuoteLoading?: boolean;
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
  isSwapping = false,
  fromBalanceText,
  toBalanceText,
  fromFiatText = "$0.00",
  toFiatText = "$0.00",
  isQuoteLoading = false,
  onMaxFrom,
  onPercentFrom,
  summary,
  ethereumAddress,
  onChangeEthereumAddress,
}: Props) {
  const { isConnected, onConnectModalOpenChange, network } = useWallet();
  const { theme } = useTheme();
  const { openTokenSelector } = useModalStore();
  const { t } = useTranslation();

  // Apply i18n defaults for balance texts
  const resolvedFromBalanceText = fromBalanceText ?? t("swap.noBalance");
  const resolvedToBalanceText = toBalanceText ?? t("swap.noBalance");

  // Refs for focusing inputs when clicking the container
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef = useRef<HTMLInputElement>(null);
  const ethAddrInputRef = useRef<HTMLInputElement>(null);

  // Track which input is focused for glow effect
  const [fromFocused, setFromFocused] = useState(false);
  const [toFocused, setToFocused] = useState(false);
  const [ethAddressFocused, setEthAddressFocused] = useState(false);

  // Bridge state
  const [bridgeActive, setBridgeActive] = useState(false);
  const [bridgeStep, setBridgeStep] = useState<BridgeStep>(1);
  const [completedSteps, setCompletedSteps] = useState<BridgeStep[]>([]);

  // Bridge tokens don't have on-chain balances
  const BRIDGE_TOKEN_IDS = ["eth", "zec", "usdt", "usdc"];
  const isFromBridgeToken = from?.id
    ? BRIDGE_TOKEN_IDS.includes(from.id)
    : false;
  const isToBridgeToken = to?.id ? BRIDGE_TOKEN_IDS.includes(to.id) : false;

  // Deposit address for cross-chain swaps
  const DEPOSIT_ADDRESS = "0x59f57b84d6742acdaa56e9da1c770898e4a270b6";

  const fromAmountNumber = parseFloat(fromAmount);
  const toAmountNumber = parseFloat(toAmount);
  const hasValidFromAmount = Number.isFinite(fromAmountNumber) && fromAmountNumber > 0;
  const hasValidToAmount = Number.isFinite(toAmountNumber) && toAmountNumber > 0;

  // For testing: allow cross-chain swap button to work even without full pricing
  const canSwapCrossChain =
    isConnected &&
    !!from &&
    !!to &&
    isFromBridgeToken &&
    hasValidFromAmount;
  const canSwap =
    isConnected &&
    !!from &&
    !!to &&
    hasValidFromAmount &&
    hasValidToAmount;

  // Enable button for cross-chain FROM tokens even without full quote
  const isButtonEnabled = canSwap || canSwapCrossChain;
  const isCtaDisabled = isSwapping || (isConnected && !isButtonEnabled);

  const ctaText = isConnected
    ? isToBridgeToken || isFromBridgeToken
      ? t("swap.confirmCrossChainSwap")
      : t("swap.confirmSwap")
    : t("swap.connectWallet");

  const onCtaClick = () => {
    if (isCtaDisabled) return;

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
    stepTimers.push(
      setTimeout(() => {
        setCompletedSteps([1]);
        setBridgeStep(2);
      }, 5000),
    );

    stepTimers.push(
      setTimeout(() => {
        setCompletedSteps([1, 2]);
        setBridgeStep(3);
      }, 10000),
    );

    stepTimers.push(
      setTimeout(() => {
        setCompletedSteps([1, 2, 3]);
        setBridgeStep(4);
      }, 15000),
    );

    stepTimers.push(
      setTimeout(() => {
        setCompletedSteps([1, 2, 3, 4]);
        setBridgeStep(5);
      }, 20000),
    );

    stepTimers.push(
      setTimeout(() => {
        setCompletedSteps([1, 2, 3, 4, 5]);
      }, 22000),
    );

    return () => {
      stepTimers.forEach(clearTimeout);
    };
  }, [bridgeActive]);

  // Check if current amount matches a specific percentage of balance
  const getActivePercent = (): number | null => {
    if (!fromAmount || !resolvedFromBalanceText) return null;

    const balanceMatch = resolvedFromBalanceText.match(/[\d.]+/);
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
  const showBtcUnwrapNotice = to?.id === "btc";
  const btcUnwrapNoticeText = from?.id === "32:0"
    ? t("swap.btcUnwrapNoticeDirect")
    : t("swap.btcUnwrapNoticeSwap");

  // ---- Cross-chain bridge pair detection ----
  // When a cross-chain pair is selected (e.g., USDT -> BTC or BTC -> USDT),
  // render the BridgeDepositFlow component instead of the normal swap form.
  const BTC_TOKEN_IDS = ["btc", "32:0"]; // BTC and frBTC
  const isCrossChainPair =
    (isFromBridgeToken && to?.id && (BTC_TOKEN_IDS.includes(to.id) || !BRIDGE_TOKEN_IDS.includes(to.id))) ||
    (isToBridgeToken && from?.id && (BTC_TOKEN_IDS.includes(from.id) || !BRIDGE_TOKEN_IDS.includes(from.id)));

  const bridgeDirection: BridgeDirection | null = isCrossChainPair
    ? isFromBridgeToken
      ? "to-btc"
      : "to-evm"
    : null;

  // Cross-chain bridge: show bridge deposit flow ONLY after user clicks swap
  // (not immediately when pair is selected — user needs to see the quote first)
  const [showBridgeFlow, setShowBridgeFlow] = useState(false);

  // Reset bridge flow when tokens change
  useEffect(() => {
    setShowBridgeFlow(false);
  }, [from?.id, to?.id]);

  if (isCrossChainPair && bridgeDirection && showBridgeFlow && fromAmount) {
    return (
      <div className="relative flex flex-col gap-3">
        <BridgeDepositFlow
          fromToken={from?.symbol ?? (isFromBridgeToken ? "USDT" : "BTC")}
          toToken={to?.symbol ?? (isToBridgeToken ? "USDT" : "BTC")}
          amount={fromAmount}
          onAmountChange={onChangeFromAmount}
        />
        <button
          onClick={() => setShowBridgeFlow(false)}
          className="text-xs text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60 transition-colors"
        >
          {t("swap.backToQuote")}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3">
      {/* Collapsible swap inputs container - slides up when bridge is active */}
      <div
        className={`flex flex-col gap-1 transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          bridgeActive
            ? "max-h-0 opacity-0 -translate-y-full pointer-events-none overflow-hidden"
            : "max-h-[1000px] opacity-100 translate-y-0 overflow-visible"
        }`}
      >
        {/* You Send - entire panel clickable to focus input */}
        <div className={`relative ${fromFocused ? "z-30" : ""}`}>
          <div
            className="sf-input group relative z-20 px-4 pt-4 pb-6 cursor-text"
            onClick={() => fromInputRef.current?.focus()}
          >
            {/* Token Selector - floating top-right */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openTokenSelector("from");
              }}
              className="sf-tile absolute right-4 top-4 inline-flex items-center gap-2 px-3 py-2 !rounded-[0.375rem] focus:outline-none z-10"
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
                {from?.name || from?.symbol || t("swap.select")}
              </span>
              <ChevronDown
                size={16}
                className="text-[color:var(--sf-text)]/60 flex-shrink-0"
              />
            </button>

            {/* Main content area */}
            <div className="flex flex-col gap-1">
              {/* Label */}
              <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">
                {t("swap.youSend")}
              </span>

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

              {/* Fiat value + Balance row */}
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-[color:var(--sf-text)]/50">
                  {fromFiatText}
                </div>
                {!isFromBridgeToken && (
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                    {resolvedFromBalanceText}
                  </div>
                )}
              </div>

              {/* Percentage Buttons (hidden for bridge tokens) */}
              {!isFromBridgeToken && (
                <div
                  className="flex items-center justify-end w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                    <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${
                      fromFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}>
                    {onPercentFrom && (
                      <>
                        <button
                          type="button"
                          onClick={() => onPercentFrom(0.25)}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                            activePercent === 0.25
                              ? "bg-[color:var(--sf-primary)]/20"
                              : `${
                                  theme === "dark"
                                    ? "bg-white/[0.03]"
                                    : "bg-[color:var(--sf-surface)]"
                                } hover:bg-white/[0.06]`
                          }`}
                        >
                          25%
                        </button>
                        <button
                          type="button"
                          onClick={() => onPercentFrom(0.5)}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                            activePercent === 0.5
                              ? "bg-[color:var(--sf-primary)]/20"
                              : `${
                                  theme === "dark"
                                    ? "bg-white/[0.03]"
                                    : "bg-[color:var(--sf-surface)]"
                                } hover:bg-white/[0.06]`
                          }`}
                        >
                          50%
                        </button>
                        <button
                          type="button"
                          onClick={() => onPercentFrom(0.75)}
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                            activePercent === 0.75
                              ? "bg-[color:var(--sf-primary)]/20"
                              : `${
                                  theme === "dark"
                                    ? "bg-white/[0.03]"
                                    : "bg-[color:var(--sf-surface)]"
                                } hover:bg-white/[0.06]`
                          }`}
                        >
                          75%
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={onMaxFrom}
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[200ms] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${
                        !onMaxFrom
                          ? "opacity-40 cursor-not-allowed"
                          : activePercent === 1
                          ? "bg-[color:var(--sf-primary)]/20"
                          : `${
                                theme === "dark"
                                  ? "bg-white/[0.03]"
                                  : "bg-[color:var(--sf-surface)]"
                              } hover:bg-white/[0.06]`
                      }`}
                      disabled={!onMaxFrom}
                    >
                      {t("swap.max")}
                    </button>
                    </div>
                  </div>
              )}
            </div>
          </div>

          {/* Invert button – overlaps both cards, centered between them */}
          <div className="pointer-events-none absolute left-1/2 -bottom-[26px] z-30 -translate-x-1/2">
            <button
              type="button"
              onClick={onInvert}
              className={`pointer-events-auto group flex h-12 w-12 items-center justify-center rounded-2xl border-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] hover:scale-105 active:scale-95 outline-none ${
                theme === "dark"
                  ? "border-[#0d192b] bg-[#162338] text-white"
                  : "border-[#dee5f1] bg-[#f7fbff] text-[#233e6b]"
              }`}
              aria-label="Invert swap direction"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none group-hover:-rotate-180"
              >
                <path
                  d="M12 5v14M19 12l-7 7-7-7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* You Receive - entire panel clickable to focus input */}
        <div
          className="sf-input group relative z-20 px-4 pb-4 pt-6 cursor-text"
          onClick={() => toInputRef.current?.focus()}
        >
          {/* Token Selector - floating top-right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTokenSelector("to");
            }}
            className="sf-tile absolute right-4 top-6 inline-flex items-center gap-2 px-3 py-2 !rounded-[0.375rem] focus:outline-none z-10"
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
              {to?.name || to?.symbol || t("swap.select")}
            </span>
            <ChevronDown
              size={16}
              className="text-[color:var(--sf-text)]/60 flex-shrink-0"
            />
          </button>

          {/* Main content area */}
          <div className="flex flex-col gap-1">
            {/* Label */}
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 pr-32">
              {t("swap.youReceive")}
            </span>

            {/* Input - full width */}
            <div className="pr-32">
              <div className="relative h-11 w-full">
                <NumberField
                  ref={toInputRef}
                  placeholder=""
                  align="left"
                  value={toAmount}
                  onChange={onChangeToAmount}
                  onFocus={() => setToFocused(true)}
                  onBlur={() => setToFocused(false)}
                  className={isQuoteLoading ? "opacity-0 pointer-events-none" : ""}
                />
                {isQuoteLoading && (
                  <div className="pointer-events-none absolute inset-0 flex items-center">
                    <div className="h-8 w-28 animate-pulse rounded-lg bg-[color:var(--sf-text)]/10" />
                  </div>
                )}
              </div>
            </div>

            {/* Fiat value + Balance on same row */}
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-[color:var(--sf-text)]/50">
                {toFiatText}
              </div>
              {!isToBridgeToken && (
                <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                  {to?.id ? resolvedToBalanceText : `${t("swap.balance")} 0`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Destination address input for cross-chain FROM BTC/Alkane (to bridge token) */}
      {isToBridgeToken && !bridgeActive && (
        <div
          className="sf-input group relative z-10 px-4 pb-4 pt-6 cursor-text"
          onClick={() => ethAddrInputRef.current?.focus()}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              {to?.id === 'zec' ? t("swap.enterZcashAddress") : t("swap.enterEthereumAddress")}
            </span>
            <input
              ref={ethAddrInputRef}
              type="text"
              value={ethereumAddress ?? ""}
              onChange={(e) => onChangeEthereumAddress?.(e.target.value)}
              onFocus={() => setEthAddressFocused(true)}
              onBlur={() => setEthAddressFocused(false)}
              placeholder={to?.id === 'zec' ? 't...' : '0x...'}
              className="w-full bg-transparent text-sm font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 outline-none"
            />
          </div>
        </div>
      )}

      {/* Summary - hidden when bridge is active */}
      <div
        className={`relative z-20 transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          bridgeActive
            ? "max-h-0 opacity-0 -translate-y-4 pointer-events-none overflow-hidden"
            : "max-h-[500px] opacity-100 translate-y-0"
        }`}
      >
        {summary}
      </div>

      {/* ActivateBridge component - grows up from button area when active */}
      <ActivateBridge
        isVisible={bridgeActive}
        amount={fromAmount}
        tokenSymbol={from?.symbol ?? "USDT"}
        depositAddress={DEPOSIT_ADDRESS}
        currentStep={bridgeStep}
        completedSteps={completedSteps}
      />

      {showBtcUnwrapNotice && !bridgeActive && (
        <div className="relative overflow-hidden rounded-lg bg-[color:var(--sf-primary)]/10 px-3 py-3">
          <Image
            src="/brand/balance-snowflake-mark.svg"
            alt=""
            aria-hidden="true"
            width={96}
            height={96}
            className="pointer-events-none absolute -right-8 top-1/2 h-24 w-24 -translate-y-1/2 rotate-12 opacity-[0.07]"
          />
          <div className="relative z-10">
            <p className="text-xs font-medium leading-5 text-[color:var(--sf-text)]/75">
              {btcUnwrapNoticeText}
              {' '}
              <a
                href="https://docs.subfrost.io/"
                target="_blank"
                rel="noreferrer"
                className="text-[color:var(--sf-primary)] no-underline hover:text-[color:var(--sf-primary-pressed)]"
              >
                {t("common.learnMore")}
              </a>
            </p>
          </div>
        </div>
      )}

      {/* CTA Button - slides down when bridge is active */}
      <div
        className={`transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          bridgeActive
            ? "max-h-0 opacity-0 translate-y-full pointer-events-none mt-0 overflow-hidden"
            : "max-h-20 opacity-100 translate-y-0 mt-2"
        }`}
      >
        <button
          type="button"
          disabled={isCtaDisabled}
          onClick={() => {
            if (isCtaDisabled) return;

            if (!isConnected) {
              onConnectModalOpenChange(true);
              return;
            }
            // Bridge tokens: show bridge deposit flow instead of normal swap
            const isBridgeSwap = isFromBridgeToken || isToBridgeToken;
            if (isBridgeSwap && isCrossChainPair && fromAmount) {
              setShowBridgeFlow(true);
              return;
            }
            onSwapClick();
          }}
          className={`h-12 w-full rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none ${
            isSwapping
              ? "bg-[color:var(--sf-primary)]/60 text-white/80 cursor-wait"
              : isConnected && !isButtonEnabled
              ? "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/30 cursor-not-allowed"
              : "bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
          }`}
        >
          {isSwapping ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t("swap.buildingTransaction")}
            </span>
          ) : !isConnected ? (
            t("swap.connectWallet")
          ) : isCrossChainPair ? (
            t("swap.bridgePair", { from: from?.symbol || '', to: to?.symbol || '' })
          ) : (
            t("swap.confirmSwap")
          )}
        </button>
      </div>
    </div>
  );
}
