"use client";

import NumberField from "@/app/components/NumberField";
import TokenSelect from "@/app/components/TokenSelect";
import type { TokenMeta } from "../types";
import { useWallet } from "@/context/WalletContext";
import { useModalStore } from "@/stores/modals";

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
  summary?: React.ReactNode;
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
  summary,
}: Props) {
  const fromOpts = fromOptions.map((t) => ({
    value: t.id,
    label: `${t.name ?? t.symbol ?? t.id} [${t.id}]`,
  }));
  const toOpts = [
    { value: '', label: 'Select a token' },
    ...toOptions.map((t) => ({
      value: t.id,
      label: `${t.name ?? t.symbol ?? t.id} [${t.id}]`,
    })),
  ];
  const { isConnected, onConnectModalOpenChange } = useWallet();
  const canSwap = isConnected &&
    !!fromAmount && !!toAmount &&
    isFinite(parseFloat(fromAmount)) && isFinite(parseFloat(toAmount)) &&
    parseFloat(fromAmount) > 0 && parseFloat(toAmount) > 0;
  const ctaText = isConnected ? "SWAP" : "CONNECT WALLET";
  const onCtaClick = () => {
    if (!isConnected) {
      onConnectModalOpenChange(true);
      return;
    }
    onSwapClick();
  };

  return (
    <div className="relative flex flex-col gap-3">
      {/* Sell panel */}
      <div className="relative rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(40,67,114,0.12)]">
        <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">You Pay</span>
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
          <div className="grid grid-cols-[1fr_160px] items-center gap-3">
            <NumberField placeholder={"0.00"} align="left" value={fromAmount} onChange={onChangeFromAmount} />
            <div className="w-[160px]">
              <TokenSelect value={from?.id ?? "btc"} options={fromOpts} onChange={onSelectFromToken} />
            </div>
            <div className="text-xs font-medium text-[color:var(--sf-text)]/50">{fromFiatText}</div>
            <div className="text-right text-xs font-medium text-[color:var(--sf-text)]/60">
              {fromBalanceText}
              <button
                type="button"
                onClick={onMaxFrom}
                className={`ml-2 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-all sf-focus-ring ${onMaxFrom ? "border border-[color:var(--sf-primary)]/30 bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/20 hover:border-[color:var(--sf-primary)]/50" : "opacity-40 cursor-not-allowed border border-transparent"}`}
              >
                Max
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invert button – centered between cards */}
      <div className="relative -my-5 mt-2 z-20 flex items-center justify-center">
        <button
          type="button"
          onClick={onInvert}
          className="group flex h-11 w-11 items-center justify-center rounded-full border-2 border-[color:var(--sf-primary)]/20 bg-gradient-to-b from-white to-[color:var(--sf-surface)] text-[color:var(--sf-primary)] shadow-[0_4px_16px_rgba(40,67,114,0.15)] transition-all hover:shadow-[0_6px_24px_rgba(40,67,114,0.25)] hover:border-[color:var(--sf-primary)]/40 hover:scale-105 active:scale-95 sf-focus-ring"
          aria-label="Invert swap direction"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="transition-transform group-hover:rotate-180 duration-300">
            <path d="M8 5l-4 4 4 4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 9h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M16 19l4-4-4-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 15H8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Receive panel */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(40,67,114,0.12)]">
        <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">You Receive</span>
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
          <div className="grid grid-cols-[1fr_160px] items-center gap-3">
            <NumberField placeholder={"0.00"} align="left" value={toAmount} onChange={onChangeToAmount} />
            <div className="w-[160px]">
              <TokenSelect value={to?.id ?? ""} options={toOpts} onChange={onSelectToToken} />
            </div>
            <div className="text-xs font-medium text-[color:var(--sf-text)]/50">{toFiatText}</div>
            <div className="text-right text-xs font-medium text-[color:var(--sf-text)]/60">{to?.id ? toBalanceText : 'Balance 0'}</div>
          </div>
        </div>

        {/* Settings chip */}
        <div className="mt-3 flex items-center justify-end">
          <SettingsButton />
        </div>
      </div>

      {/* Summary */}
      {summary}

      {/* CTA */}
      <button
        type="button"
        onClick={onCtaClick}
        disabled={!canSwap && isConnected}
        className="mt-2 h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(40,67,114,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(40,67,114,0.4)] hover:scale-[1.02] active:scale-[0.98] sf-focus-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(40,67,114,0.3)]"
      >
        {ctaText}
      </button>
    </div>
  );
}

function SettingsButton() {
  const { openTxSettings } = useModalStore();
  return (
    <button
      type="button"
      onClick={() => openTxSettings()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-white/80 px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] backdrop-blur-sm transition-all hover:bg-white hover:border-[color:var(--sf-primary)]/30 hover:shadow-sm sf-focus-ring"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span>Settings</span>
    </button>
  );
}



