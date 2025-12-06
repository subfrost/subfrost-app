"use client";

import { useState } from "react";
import Tabs from "./Tabs";
import TokenSelect from "./TokenSelect";
import NumberField from "./NumberField";
import { useWallet } from "@/context/WalletContext";
import { useBtcBalance } from "@/hooks/useBtcBalance";
import { formatBtc, satsToBtc } from "@/utils/format";

export default function StakeCard() {
  const [amount, setAmount] = useState<string>("");
  const { isConnected, onConnectModalOpenChange } = useWallet();
  const { data: sats = 0, isLoading } = useBtcBalance();
  const btcAmountDisplay = isConnected ? formatBtc(satsToBtc(sats)) : "0.00000000";
  const isStakeDisabled = isConnected && (!amount || !isFinite(parseFloat(amount)) || parseFloat(amount) <= 0);

  return (
    <section className="w-full max-w-[460px] rounded-[22px] border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-8 sm:p-10 shadow-[0_8px_36px_rgba(0,0,0,0.14)] backdrop-blur-md">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-[32px] sm:text-[36px] font-extrabold tracking-[0.01em] leading-tight text-[color:var(--sf-text)]">
          STAKE BTC,
          <br /> EARN YIELD IN BTC
        </h1>
        <Tabs />
      </div>

      {/* Content column aligned to the same left edge */}
      <div className="mt-6 mx-auto w-full max-w-[320px] font-semibold">
        <p className="text-sm leading-6 text-[color:var(--sf-text)]/80">
          Enter the amount of BTC you want to stake to the SUBFROST Yield Vault.
        </p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--sf-text)]/80">
          You will recieve dxBTC, which is always redeemable 1:1 for your staked BTC + BTC Earnings.
        </p>

        {/* Constrained form area */}
        <div className="mt-8 w-full">
          <div>
            <span className="text-xs font-semibold text-[color:var(--sf-text)]/70">You're Staking:</span>
            <div className="grid grid-cols-[160px_1fr] gap-3 mt-3">
            <TokenSelect />
            <input
              type="number"
              step="0.00000001"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-right text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] focus:outline-none"
            />
          </div>
            <div className="mt-2 text-xs text-[color:var(--sf-text)]/60">
              Available: {isConnected && isLoading ? (
                <span className="inline-block h-4 w-32 animate-pulse rounded bg-[color:var(--sf-outline)]/40 align-middle" />
              ) : (
                <span title={`${sats} sats`}>
                  {btcAmountDisplay}
                  {btcAmountDisplay.includes('sats') ? '' : ' BTC'}
                </span>
              )}
            </div>
        </div>

        {/* Fees stacked, left-aligned */}
          <div className="mt-5 space-y-1 text-xs text-[color:var(--sf-text)]/70">
            <div>Bitcoin Network Fee: <span className="font-semibold text-[color:var(--sf-text)]">5 sat/vbyte</span></div>
            <div>SUBFROST Fee: <span className="font-semibold text-[color:var(--sf-text)]">0% - always 0% to stake!</span></div>
        </div>

        {/* Receive group */}
        <div className="mt-5">
          <span className="text-xs font-semibold text-[color:var(--sf-text)]/70">You'll Receive:</span>
          <div className="grid grid-cols-[160px_1fr] gap-3 mt-3">
            <div className="flex h-10 w-full items-center justify-center rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)] px-3 text-sm font-semibold text-white shadow-sm">
              dxBTC
            </div>
            <NumberField placeholder="0.00000000" disabled />
          </div>
        </div>

        {/* CTA matches form width */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => {
              if (!isConnected) onConnectModalOpenChange(true);
            }}
            disabled={isStakeDisabled}
            className="w-full rounded-lg bg-[color:var(--sf-primary)] py-3 text-sm font-semibold tracking-wide text-white shadow-sm transition-colors hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none"
          >
            {isConnected ? 'STAKE BTC' : 'CONNECT WALLET'}
          </button>
        </div>
        {/* Post-CTA explanatory paragraph */}
        <p className="mt-4 text-center text-xs leading-5 text-[color:var(--sf-text)]/70">
          Your BTC will be deployed into the safest yield-bearing strategies. You'll receive
          <span className="font-semibold text-[color:var(--sf-text)]"> dxBTC</span>, redeemable 1:1 for your staked BTC plus earnings.
        </p>
        </div>
      </div>
    </section>
  );
}


