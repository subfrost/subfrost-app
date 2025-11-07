"use client";

import type { AddressPositionsResult } from "@/lib/api-provider/apiclient/types";

type Props = {
  positions: AddressPositionsResult[];
  isLoading: boolean;
};

export default function UserPositionsList({ positions, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
        <div className="text-center text-sm text-[color:var(--sf-text)]/70">
          Loading your positions...
        </div>
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
        <div className="text-center text-sm text-[color:var(--sf-text)]/70">
          You don't have any liquidity positions yet. Add liquidity above to get started.
        </div>
      </div>
    );
  }

  const formatUsd = (v?: number) => {
    if (v == null) return "-";
    return new Intl.NumberFormat(undefined, { 
      style: "currency", 
      currency: "USD", 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(v);
  };

  const formatAmount = (amount?: string) => {
    if (!amount) return "0";
    const num = Number(amount) / 1e8;
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-[color:var(--sf-text)]">Your Positions</h3>
      
      <div className="space-y-3">
        {positions.map((position, idx) => (
          <div
            key={`${position.poolId.block}-${position.poolId.tx}-${idx}`}
            className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4 transition hover:bg-white/5"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-semibold text-[color:var(--sf-text)]">
                {position.poolName || "LP Position"}
              </div>
              <div className="text-sm font-bold text-[color:var(--sf-primary)]">
                {formatUsd(position.totalValueInUsd)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="mb-1 text-xs text-[color:var(--sf-text)]/60">Token 0</div>
                <div className="font-medium text-[color:var(--sf-text)]">
                  {formatAmount(position.token0Amount)}
                </div>
                <div className="text-xs text-[color:var(--sf-text)]/70">
                  {formatUsd(position.token0ValueInUsd)}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs text-[color:var(--sf-text)]/60">Token 1</div>
                <div className="font-medium text-[color:var(--sf-text)]">
                  {formatAmount(position.token1Amount)}
                </div>
                <div className="text-xs text-[color:var(--sf-text)]/70">
                  {formatUsd(position.token1ValueInUsd)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--sf-glass-border)] pt-3 text-xs">
              <div>
                <span className="text-[color:var(--sf-text)]/60">LP Tokens: </span>
                <span className="font-medium text-[color:var(--sf-text)]">
                  {formatAmount(position.balance)}
                </span>
              </div>
              <div>
                <span className="text-[color:var(--sf-text)]/60">Pool TVL: </span>
                <span className="font-medium text-[color:var(--sf-text)]">
                  {formatUsd(position.poolTvlInUsd)}
                </span>
              </div>
            </div>

            {position.poolApr && (
              <div className="mt-2 text-center text-xs">
                <span className="text-[color:var(--sf-text)]/60">APR: </span>
                <span className="font-semibold text-green-500">
                  {position.poolApr.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
