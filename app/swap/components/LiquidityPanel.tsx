"use client";

import { Plus, ChevronDown } from "lucide-react";
import type { Network } from "@oyl/sdk";
import type { TokenMeta } from "../types";
import NumberField from "@/app/components/NumberField";
import TokenIcon from "@/app/components/TokenIcon";
import { useModalStore } from "@/stores/modals";

type Props = {
  token0?: TokenMeta;
  token1?: TokenMeta;
  token0Amount: string;
  token1Amount: string;
  onChangeToken0Amount: (value: string) => void;
  onChangeToken1Amount: (value: string) => void;
  onOpenToken0Selector: () => void;
  onOpenToken1Selector: () => void;
  onAddLiquidity: () => void;
  token0BalanceText: string;
  token1BalanceText: string;
  token0FiatText: string;
  token1FiatText: string;
  onMaxToken0?: () => void;
  onMaxToken1?: () => void;
  summary?: React.ReactNode;
  network?: Network;
};

export default function LiquidityPanel({
  token0,
  token1,
  token0Amount,
  token1Amount,
  onChangeToken0Amount,
  onChangeToken1Amount,
  onOpenToken0Selector,
  onOpenToken1Selector,
  onAddLiquidity,
  token0BalanceText,
  token1BalanceText,
  token0FiatText,
  token1FiatText,
  onMaxToken0,
  onMaxToken1,
  summary,
  network,
}: Props) {
  const canAdd = token0 && token1 && Number(token0Amount) > 0 && Number(token1Amount) > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Token 0 Input */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(40,67,114,0.12)]">
        <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">Token 1</span>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <NumberField
              value={token0Amount}
              onChange={onChangeToken0Amount}
              placeholder="0.00"
              align="left"
            />
          </div>
          <button
            type="button"
            onClick={onOpenToken0Selector}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-white/90 px-3 py-2 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-white hover:shadow-md sf-focus-ring"
          >
            {token0 ? (
              <>
                <TokenIcon symbol={token0.symbol} iconUrl={token0.iconUrl} network={network} size="sm" />
                <span className="text-sm font-bold text-[color:var(--sf-text)]">{token0.symbol}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-[color:var(--sf-text)]">Select</span>
            )}
            <ChevronDown size={16} className="text-[color:var(--sf-text)]/50" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-[color:var(--sf-text)]/60">{token0FiatText}</span>
          <div className="flex items-center gap-3">
            <span className="text-[color:var(--sf-text)]/70">{token0BalanceText}</span>
            {onMaxToken0 && (
              <button
                type="button"
                onClick={onMaxToken0}
                className="font-semibold text-[color:var(--sf-primary)] hover:underline sf-focus-ring rounded"
              >
                MAX
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plus Icon */}
      <div className="flex justify-center">
        <div className="rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-2">
          <Plus size={20} className="text-[color:var(--sf-text)]/70" />
        </div>
      </div>

      {/* Token 1 Input */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_2px_12px_rgba(40,67,114,0.08)] backdrop-blur-md transition-all hover:shadow-[0_4px_20px_rgba(40,67,114,0.12)]">
        <span className="mb-3 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">Token 2</span>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <NumberField
              value={token1Amount}
              onChange={onChangeToken1Amount}
              placeholder="0.00"
              align="left"
            />
          </div>
          <button
            type="button"
            onClick={onOpenToken1Selector}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-outline)] bg-white/90 px-3 py-2 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-white hover:shadow-md sf-focus-ring"
          >
            {token1 ? (
              <>
                <TokenIcon symbol={token1.symbol} iconUrl={token1.iconUrl} network={network} size="sm" />
                <span className="text-sm font-bold text-[color:var(--sf-text)]">{token1.symbol}</span>
              </>
            ) : (
              <span className="text-sm font-bold text-[color:var(--sf-text)]">Select</span>
            )}
            <ChevronDown size={16} className="text-[color:var(--sf-text)]/50" />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-[color:var(--sf-text)]/60">{token1FiatText}</span>
          <div className="flex items-center gap-3">
            <span className="text-[color:var(--sf-text)]/70">{token1BalanceText}</span>
            {onMaxToken1 && (
              <button
                type="button"
                onClick={onMaxToken1}
                className="font-semibold text-[color:var(--sf-primary)] hover:underline sf-focus-ring rounded"
              >
                MAX
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      {summary && <div className="mt-2">{summary}</div>}

      {/* Add Liquidity Button */}
      <button
        type="button"
        onClick={onAddLiquidity}
        disabled={!canAdd}
        className="mt-4 w-full rounded-xl bg-[color:var(--sf-primary)] py-4 text-base font-bold tracking-wide text-white transition-all hover:bg-[color:var(--sf-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50 sf-focus-ring"
      >
        {canAdd ? 'ADD LIQUIDITY' : 'ENTER AMOUNTS'}
      </button>
    </div>
  );
}
