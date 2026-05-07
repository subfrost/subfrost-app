"use client";

/**
 * BridgeLifecycleTracker — real-time progress visualization for bridge operations.
 *
 * Shows step-by-step status of each bridge operation (deposit -> bridge -> swap -> deliver).
 * Operations are persisted in localStorage so they survive page reloads.
 *
 * JOURNAL (2026-03-23): Phase 6 implementation. Created as a standalone component
 * that receives operations array from the parent (BridgeDepositFlow). The parent
 * manages localStorage persistence and passes state down.
 */

import { useMemo } from "react";
import { Check, X, ExternalLink, Loader2, Clock } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

// ---- Types ----

export type BridgeOperationStatus =
  | "pending"
  | "deposited"
  | "bridging"
  | "executing"
  | "complete"
  | "failed";

export interface BridgeOperation {
  id: string;
  direction: "to-btc" | "to-stable";
  status: BridgeOperationStatus;
  inputAmount: string;
  outputAmount: string;
  inputToken: string;
  outputToken: string;
  evmTxHash?: string;
  btcTxId?: string;
  timestamp: number;
  errorMessage?: string;
}

// ---- Step definitions ----

interface StepDef {
  key: string;
  label: string;
}

function getSteps(direction: "to-btc" | "to-stable"): StepDef[] {
  if (direction === "to-btc") {
    return [
      { key: "deposit", label: "Deposit confirmed" },
      { key: "bridge", label: "Bridging to Bitcoin" },
      { key: "swap", label: "Executing swap" },
      { key: "deliver", label: "Delivering BTC" },
    ];
  }
  return [
    { key: "wrap", label: "Wrapping BTC" },
    { key: "swap", label: "Swapping frBTC" },
    { key: "bridge", label: "Bridging to EVM" },
    { key: "deliver", label: "Delivering stablecoins" },
  ];
}

function getActiveStepIndex(status: BridgeOperationStatus): number {
  switch (status) {
    case "pending":
      return -1;
    case "deposited":
      return 0;
    case "bridging":
      return 1;
    case "executing":
      return 2;
    case "complete":
      return 4; // All done
    case "failed":
      return -2; // Error state
    default:
      return -1;
  }
}

// ---- Time formatting ----

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

// ---- Props ----

interface Props {
  operations: BridgeOperation[];
  onDismiss?: (operationId: string) => void;
}

// ---- Component ----

export default function BridgeLifecycleTracker({ operations, onDismiss }: Props) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  // Split into active (incomplete) and recent (complete/failed)
  const { active, recent } = useMemo(() => {
    const act: BridgeOperation[] = [];
    const rec: BridgeOperation[] = [];
    for (const op of operations) {
      if (op.status === "complete" || op.status === "failed") {
        rec.push(op);
      } else {
        act.push(op);
      }
    }
    // Limit recent to last 5
    return { active: act, recent: rec.slice(0, 5) };
  }, [operations]);

  if (operations.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Active operations */}
      {active.map((op) => (
        <ActiveOperationCard
          key={op.id}
          operation={op}
          isDark={isDark}
          onDismiss={onDismiss}
        />
      ))}

      {/* Recent operations */}
      {recent.length > 0 && (
        <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 mb-3">
            Recent Bridges
          </label>
          <div className="space-y-2">
            {recent.map((op) => (
              <RecentOperationRow
                key={op.id}
                operation={op}
                isDark={isDark}
                onDismiss={onDismiss}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Active Operation Card ----

function ActiveOperationCard({
  operation,
  isDark,
  onDismiss,
}: {
  operation: BridgeOperation;
  isDark: boolean;
  onDismiss?: (id: string) => void;
}) {
  const steps = getSteps(operation.direction);
  const activeIndex = getActiveStepIndex(operation.status);
  const isFailed = operation.status === "failed";

  return (
    <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[color:var(--sf-text)]">
            {operation.inputAmount} {operation.inputToken} {"\u2192"}{" "}
            {operation.outputAmount} {operation.outputToken}
          </span>
          {!isFailed && (
            <Loader2
              size={12}
              className="text-[color:var(--sf-primary)] animate-spin"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[color:var(--sf-text)]/40">
            {formatTimestamp(operation.timestamp)}
          </span>
          {onDismiss && (
            <button
              onClick={() => onDismiss(operation.id)}
              className="text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/60 transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2.5">
        {steps.map((step, idx) => {
          const isComplete = idx < activeIndex;
          const isActive = idx === activeIndex;
          const isPending = idx > activeIndex;

          return (
            <div key={step.key} className="flex items-center gap-3">
              {/* Status dot */}
              <div className="flex-shrink-0 relative">
                {isComplete ? (
                  <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                    <Check size={10} className="text-white" />
                  </div>
                ) : isActive ? (
                  <div className="w-5 h-5 rounded-full bg-[color:var(--sf-primary)] flex items-center justify-center animate-pulse">
                    <Loader2 size={10} className="text-white animate-spin" />
                  </div>
                ) : isFailed && idx === 0 ? (
                  <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </div>
                ) : (
                  <div
                    className={`w-5 h-5 rounded-full border-2 ${
                      isDark
                        ? "border-zinc-700"
                        : "border-gray-300"
                    }`}
                  />
                )}
                {/* Connecting line */}
                {idx < steps.length - 1 && (
                  <div
                    className={`absolute left-[9px] top-5 w-0.5 h-3 ${
                      isComplete
                        ? "bg-green-500"
                        : isDark
                        ? "bg-zinc-700"
                        : "bg-gray-300"
                    }`}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm transition-colors ${
                  isComplete
                    ? "text-green-500 font-medium"
                    : isActive
                    ? "text-[color:var(--sf-text)] font-medium"
                    : "text-[color:var(--sf-text)]/40"
                }`}
              >
                {step.label}
                {isComplete && (
                  <span className="ml-2 text-[10px] text-green-500/60">
                    {formatTimestamp(operation.timestamp)}
                  </span>
                )}
                {isActive && (
                  <span className="ml-2 text-[10px] text-[color:var(--sf-primary)]/60">
                    ...
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {isFailed && operation.errorMessage && (
        <div className="mt-3 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
          {operation.errorMessage}
        </div>
      )}

      {/* Transaction links */}
      <div className="mt-3 flex items-center gap-3">
        {operation.evmTxHash && (
          <a
            href={`https://etherscan.io/tx/${operation.evmTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-[color:var(--sf-primary)] hover:underline"
          >
            EVM: {truncateHash(operation.evmTxHash)}
            <ExternalLink size={10} />
          </a>
        )}
        {operation.btcTxId && (
          <a
            href={`https://mempool.space/tx/${operation.btcTxId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-[color:var(--sf-primary)] hover:underline"
          >
            BTC: {truncateHash(operation.btcTxId)}
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

// ---- Recent Operation Row ----

function RecentOperationRow({
  operation,
  isDark,
  onDismiss,
}: {
  operation: BridgeOperation;
  isDark: boolean;
  onDismiss?: (id: string) => void;
}) {
  const isComplete = operation.status === "complete";
  const isFailed = operation.status === "failed";

  return (
    <div
      className={`flex items-center justify-between py-2 px-2 rounded-lg ${
        isDark ? "hover:bg-zinc-800/50" : "hover:bg-gray-50"
      } transition-colors`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isComplete ? (
          <Check size={14} className="text-green-500 flex-shrink-0" />
        ) : (
          <X size={14} className="text-red-400 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-xs font-medium text-[color:var(--sf-text)] truncate">
            {operation.inputAmount} {operation.inputToken} {"\u2192"}{" "}
            {operation.outputAmount} {operation.outputToken}
          </div>
          <div className="text-[10px] text-[color:var(--sf-text)]/40 flex items-center gap-1">
            <Clock size={9} />
            {formatTimeAgo(operation.timestamp)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {operation.btcTxId && (
          <a
            href={`https://mempool.space/tx/${operation.btcTxId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[color:var(--sf-primary)]"
          >
            <ExternalLink size={12} />
          </a>
        )}
        {onDismiss && (
          <button
            onClick={() => onDismiss(operation.id)}
            className="text-[color:var(--sf-text)]/20 hover:text-[color:var(--sf-text)]/50 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
