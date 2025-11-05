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
      <div className="relative rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4 shadow-sm">
        <span className="mb-2 block text-xs font-semibold tracking-wide text-[color:var(--sf-text)]/80">FROM</span>
        <div className="rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-2 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/40">
          <div className="grid grid-cols-[1fr_160px] items-center gap-3">
            <NumberField placeholder={"0.00"} align="left" value={fromAmount} onChange={onChangeFromAmount} />
            <div className="w-[160px]">
              <TokenSelect value={from?.id ?? "btc"} options={fromOpts} onChange={onSelectFromToken} />
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/60">{fromFiatText}</div>
            <div className="text-right text-xs text-[color:var(--sf-text)]/60">
              {fromBalanceText}
              <button
                type="button"
                onClick={onMaxFrom}
                className={`ml-2 inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold sf-focus-ring ${onMaxFrom ? "border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] hover:bg-white/10" : "opacity-50 cursor-default border border-transparent"}`}
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
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white text-[color:var(--sf-text)] shadow-md sf-focus-ring"
          aria-label="Invert"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 5l-4 4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 19l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M20 15H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Receive panel */}
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4 shadow-sm">
        <span className="mb-2 block text-xs font-semibold tracking-wide text-[color:var(--sf-text)]/80">TO</span>
        <div className="rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-2 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/40">
          <div className="grid grid-cols-[1fr_160px] items-center gap-3">
            <NumberField placeholder={"0.00"} align="left" value={toAmount} onChange={onChangeToAmount} />
            <div className="w-[160px]">
              <TokenSelect value={to?.id ?? ""} options={toOpts} onChange={onSelectToToken} />
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/60">{toFiatText}</div>
            <div className="text-right text-xs text-[color:var(--sf-text)]/60">{to?.id ? toBalanceText : 'Balance 0'}</div>
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
        className="mt-1 h-11 w-full rounded-lg bg-[color:var(--sf-primary)] font-semibold text-white shadow sf-focus-ring disabled:opacity-60 disabled:cursor-not-allowed"
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
      className="inline-flex items-center gap-1 rounded-md border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-2 py-1 text-xs text-[color:var(--sf-text)] backdrop-blur-md sf-focus-ring"
    >
      <span>Settings</span>
    </button>
  );
}



