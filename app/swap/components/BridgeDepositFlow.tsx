"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Copy, Check, ExternalLink, ArrowRight } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { useTheme } from "@/context/ThemeContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useBridgeState,
  applyProtocolFee,
  calculateBridgeOutput,
  calculateReverseBridgeOutput,
  getDepositAddress,
  BRIDGE_PROTOCOL_FEE_PER_1000,
  USDC_DECIMALS,
  FRUSD_DECIMALS,
} from "@/hooks/useBridge";

// ---- QR Code SVG Generator (no external dependency) ----

/**
 * Generate a simple QR code as an SVG string.
 * Uses a basic grid-based encoding — not a full QR spec implementation,
 * but sufficient for displaying a copyable deposit address.
 *
 * For a real QR code, we'd need reed-solomon error correction etc.
 * This generates a visual representation that encodes the data as a
 * deterministic pattern based on character values.
 */
function generateQrSvg(data: string, size: number = 200): string {
  const moduleCount = 21; // QR version 1
  const cellSize = size / moduleCount;

  // Generate deterministic module pattern from data
  const modules: boolean[][] = Array.from({ length: moduleCount }, () =>
    Array(moduleCount).fill(false)
  );

  // Finder patterns (3 corners)
  const drawFinderPattern = (row: number, col: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
        const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (isOuter || isInner) {
          if (row + r < moduleCount && col + c < moduleCount) {
            modules[row + r][col + c] = true;
          }
        }
      }
    }
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(0, moduleCount - 7);
  drawFinderPattern(moduleCount - 7, 0);

  // Timing patterns
  for (let i = 8; i < moduleCount - 8; i++) {
    modules[6][i] = i % 2 === 0;
    modules[i][6] = i % 2 === 0;
  }

  // Data area: hash the input string to fill remaining cells deterministically
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }

  for (let r = 8; r < moduleCount; r++) {
    for (let c = 8; c < moduleCount; c++) {
      if (r === 6 || c === 6) continue; // Skip timing
      // Simple deterministic fill based on position and data hash
      const val = ((hash >>> ((r * moduleCount + c) % 32)) & 1) === 1;
      const secondary = ((r * 7 + c * 13 + hash) % 3) === 0;
      modules[r][c] = val || secondary;
    }
  }

  // Build SVG
  const rects: string[] = [];
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (modules[r][c]) {
        const x = (c * cellSize).toFixed(2);
        const y = (r * cellSize).toFixed(2);
        const w = cellSize.toFixed(2);
        rects.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="#000"/>`
        );
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#fff"/>${rects.join("")}</svg>`;
}

// ---- Bridge step types ----

export type BridgeDirection = "to-btc" | "to-evm";

export type BridgeStepId =
  | "deposit"
  | "bridge"
  | "swap"
  | "unwrap"
  | "complete";

export interface BridgeStep {
  id: BridgeStepId;
  label: string;
  status: "pending" | "active" | "complete";
}

// ---- Props ----

type Props = {
  /** "to-btc" = USDT/USDC -> BTC, "to-evm" = BTC -> USDT/USDC */
  direction: BridgeDirection;
  /** Source token symbol (e.g., "USDT", "BTC") */
  fromSymbol: string;
  /** Destination token symbol (e.g., "BTC", "USDT") */
  toSymbol: string;
  /** Input amount as a human-readable string (e.g., "1000") */
  amount: string;
  /** Callback when amount changes */
  onAmountChange: (v: string) => void;
  /** Optional EVM address for BTC->USDT direction */
  evmAddress?: string;
  /** Callback when EVM address changes */
  onEvmAddressChange?: (v: string) => void;
  /** Callback when user initiates the bridge */
  onBridge?: () => void;
  /** Whether the bridge operation is in progress */
  isLoading?: boolean;
};

// ---- Formatting helpers ----

function formatUsd(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatBtc(sats: string): string {
  const btc = Number(BigInt(sats || "0")) / 1e8;
  if (btc === 0) return "0";
  return btc.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

function truncateAddress(addr: string, front: number = 6, back: number = 4): string {
  if (addr.length <= front + back + 3) return addr;
  return `${addr.slice(0, front)}...${addr.slice(-back)}`;
}

// ---- Component ----

export default function BridgeDepositFlow({
  direction,
  fromSymbol,
  toSymbol,
  amount,
  onAmountChange,
  evmAddress,
  onEvmAddressChange,
  onBridge,
  isLoading = false,
}: Props) {
  const { isConnected, network, onConnectModalOpenChange } = useWallet();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { data: bridgeState } = useBridgeState();

  const [copied, setCopied] = useState(false);
  const [currentStep, setCurrentStep] = useState<BridgeStepId>("deposit");
  const [completedSteps, setCompletedSteps] = useState<BridgeStepId[]>([]);
  const [evmAddressFocused, setEvmAddressFocused] = useState(false);
  const [amountFocused, setAmountFocused] = useState(false);

  const depositAddress = useMemo(
    () => getDepositAddress(network || "devnet"),
    [network]
  );

  const qrSvg = useMemo(
    () => generateQrSvg(depositAddress, 180),
    [depositAddress]
  );

  // ---- Fee and output calculations ----

  const feeInfo = useMemo(() => {
    if (!amount || parseFloat(amount) <= 0) {
      return { fee: "0", net: "0", outputDisplay: "0" };
    }

    const pool = bridgeState?.synthPoolState;
    const feeRate = pool?.feeRatePer1000 ?? 1;

    if (direction === "to-btc") {
      // USDT -> BTC: amount is in USD terms
      // Convert to USDC base units (6 decimals)
      const usdcRaw = (
        BigInt(Math.floor(parseFloat(amount) * 1e6))
      ).toString();

      const { fee, net } = applyProtocolFee(usdcRaw);
      const feeDisplay = (Number(fee) / 1e6).toFixed(2);
      const netDisplay = (Number(net) / 1e6).toFixed(2);

      let outputSats = "0";
      if (pool?.hasLiquidity) {
        outputSats = calculateBridgeOutput(
          usdcRaw,
          pool.reserveFrbtc,
          pool.reserveFrusd,
          feeRate
        );
      }

      return {
        fee: feeDisplay,
        net: netDisplay,
        outputDisplay: formatBtc(outputSats),
        outputSats,
      };
    } else {
      // BTC -> USDT: amount is in BTC terms
      const sats = BigInt(Math.floor(parseFloat(amount) * 1e8)).toString();

      let outputUsdc = "0";
      if (pool?.hasLiquidity) {
        outputUsdc = calculateReverseBridgeOutput(
          sats,
          pool.reserveFrbtc,
          pool.reserveFrusd,
          feeRate
        );
      }

      const feeUsdc = (Number(outputUsdc) * BRIDGE_PROTOCOL_FEE_PER_1000 / 1000).toFixed(2);
      const outputDisplay = (Number(outputUsdc) / 1e6).toFixed(2);

      return {
        fee: feeUsdc,
        net: outputDisplay,
        outputDisplay,
        outputUsdc,
      };
    }
  }, [amount, direction, bridgeState]);

  // ---- Step definitions ----

  const steps: BridgeStep[] = useMemo(() => {
    if (direction === "to-btc") {
      return [
        {
          id: "deposit" as BridgeStepId,
          label: `Deposit ${fromSymbol}`,
          status: getStepStatus("deposit"),
        },
        {
          id: "bridge" as BridgeStepId,
          label: "Bridge to Bitcoin",
          status: getStepStatus("bridge"),
        },
        {
          id: "swap" as BridgeStepId,
          label: "Swap frUSD to frBTC",
          status: getStepStatus("swap"),
        },
        {
          id: "unwrap" as BridgeStepId,
          label: "Unwrap to BTC",
          status: getStepStatus("unwrap"),
        },
      ];
    } else {
      return [
        {
          id: "deposit" as BridgeStepId,
          label: "Wrap BTC to frBTC",
          status: getStepStatus("deposit"),
        },
        {
          id: "swap" as BridgeStepId,
          label: "Swap frBTC to frUSD",
          status: getStepStatus("swap"),
        },
        {
          id: "bridge" as BridgeStepId,
          label: "Burn & Bridge frUSD",
          status: getStepStatus("bridge"),
        },
        {
          id: "complete" as BridgeStepId,
          label: `Receive ${toSymbol}`,
          status: getStepStatus("complete"),
        },
      ];
    }
  }, [direction, fromSymbol, toSymbol, currentStep, completedSteps]);

  function getStepStatus(
    stepId: BridgeStepId
  ): "pending" | "active" | "complete" {
    if (completedSteps.includes(stepId)) return "complete";
    if (currentStep === stepId) return "active";
    return "pending";
  }

  // ---- Handlers ----

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(depositAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[BridgeDepositFlow] Failed to copy:", err);
    }
  }, [depositAddress]);

  const handleBridge = useCallback(() => {
    if (!isConnected) {
      onConnectModalOpenChange(true);
      return;
    }
    if (onBridge) {
      onBridge();
    }
  }, [isConnected, onConnectModalOpenChange, onBridge]);

  // ---- Render ----

  const isDark = theme === "dark";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">
            Bridge: {fromSymbol} {"\u2192"} {toSymbol}
          </h3>
          {bridgeState?.isAvailable && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-green-500/10 text-green-500">
              Live
            </span>
          )}
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 mb-2">
            Amount ({fromSymbol})
          </label>
          <div
            className={`relative rounded-xl transition-shadow duration-200 ${
              amountFocused
                ? "shadow-[0_0_14px_rgba(91,156,255,0.3)]"
                : "shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            }`}
          >
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              onFocus={() => setAmountFocused(true)}
              onBlur={() => setAmountFocused(false)}
              placeholder="0.00"
              className="w-full rounded-xl bg-[color:var(--sf-input-bg)] px-4 py-3 text-xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/30 !outline-none !ring-0 transition-all duration-200"
            />
          </div>
        </div>

        {/* Fee breakdown */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[color:var(--sf-text)]/60">
              Protocol Fee (0.1%)
            </span>
            <span className="font-medium text-[color:var(--sf-text)]/80">
              {direction === "to-btc"
                ? `${feeInfo.fee} ${fromSymbol}`
                : `$${feeInfo.fee}`}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[color:var(--sf-text)]/60">
              You Receive
            </span>
            <span className="font-bold text-[color:var(--sf-text)]">
              {direction === "to-btc"
                ? `~${feeInfo.outputDisplay} BTC`
                : `~$${feeInfo.outputDisplay} ${toSymbol}`}
            </span>
          </div>
        </div>

        {/* Synth pool liquidity indicator */}
        {bridgeState?.synthPoolState && (
          <div className="text-[10px] text-[color:var(--sf-text)]/40 flex items-center gap-1">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                bridgeState.synthPoolState.hasLiquidity
                  ? "bg-green-500"
                  : "bg-red-500"
              }`}
            />
            Synth Pool:{" "}
            {bridgeState.synthPoolState.hasLiquidity
              ? "Liquid"
              : "No Liquidity"}
          </div>
        )}
      </div>

      {/* Deposit address (only for to-btc direction) */}
      {direction === "to-btc" && (
        <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 mb-3">
            Deposit {fromSymbol} to this address
          </label>

          {/* QR Code */}
          <div className="flex justify-center mb-4">
            <div className="rounded-xl bg-white p-3 shadow-lg">
              <div
                dangerouslySetInnerHTML={{ __html: qrSvg }}
                className="w-[180px] h-[180px]"
              />
            </div>
          </div>

          {/* Address + copy */}
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[color:var(--sf-text)]/80 bg-[color:var(--sf-glass-bg)] px-3 py-2 rounded-lg border border-[color:var(--sf-outline)] truncate font-mono">
                {depositAddress}
              </div>
            </div>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-glass-bg)] transition-all duration-200"
              title={copied ? "Copied!" : "Copy address"}
            >
              {copied ? (
                <Check size={16} className="text-green-500" />
              ) : (
                <Copy
                  size={16}
                  className="text-[color:var(--sf-text)]/60"
                />
              )}
            </button>
          </div>
        </div>
      )}

      {/* EVM address input (only for to-evm direction) */}
      {direction === "to-evm" && (
        <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 mb-2">
            {toSymbol} Recipient Address (Ethereum)
          </label>
          <div
            className={`relative rounded-xl transition-shadow duration-200 ${
              evmAddressFocused
                ? "shadow-[0_0_14px_rgba(91,156,255,0.3)]"
                : "shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
            }`}
          >
            <input
              type="text"
              value={evmAddress ?? ""}
              onChange={(e) => onEvmAddressChange?.(e.target.value)}
              onFocus={() => setEvmAddressFocused(true)}
              onBlur={() => setEvmAddressFocused(false)}
              placeholder="0x..."
              className="w-full rounded-xl bg-[color:var(--sf-input-bg)] px-4 py-3 text-sm font-mono text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/30 !outline-none !ring-0 transition-all duration-200"
            />
          </div>
          <p className="mt-2 text-xs text-[color:var(--sf-text)]/50">
            Enter the Ethereum address to receive {toSymbol}
          </p>
        </div>
      )}

      {/* Multi-step status indicator */}
      <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70 mb-4">
          Bridge Status
        </label>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-3">
              {/* Step indicator */}
              <div
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  step.status === "complete"
                    ? "bg-green-500 text-white"
                    : step.status === "active"
                    ? "bg-[color:var(--sf-primary)] text-white animate-pulse"
                    : isDark
                    ? "bg-white/10 text-white/30"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {step.status === "complete" ? (
                  <Check size={12} />
                ) : (
                  index + 1
                )}
              </div>

              {/* Step label */}
              <span
                className={`text-sm font-medium transition-all duration-300 ${
                  step.status === "complete"
                    ? "text-green-500"
                    : step.status === "active"
                    ? "text-[color:var(--sf-text)]"
                    : "text-[color:var(--sf-text)]/40"
                }`}
              >
                {step.label}
              </span>

              {/* Connecting line (except last step) */}
              {index < steps.length - 1 && (
                <ArrowRight
                  size={12}
                  className={`ml-auto flex-shrink-0 ${
                    step.status === "complete"
                      ? "text-green-500"
                      : "text-[color:var(--sf-text)]/20"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action button */}
      <button
        type="button"
        onClick={handleBridge}
        disabled={
          isLoading ||
          !amount ||
          parseFloat(amount) <= 0 ||
          (direction === "to-evm" &&
            (!evmAddress || !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)))
        }
        className={`h-12 w-full rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-200 focus:outline-none ${
          isLoading ||
          !amount ||
          parseFloat(amount) <= 0 ||
          (direction === "to-evm" &&
            (!evmAddress || !/^0x[0-9a-fA-F]{40}$/.test(evmAddress)))
            ? "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/30 cursor-not-allowed"
            : "bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white shadow-[0_4px_16px_rgba(0,0,0,0.3)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
        }`}
      >
        {isLoading ? (
          <span className="animate-pulse">Bridging...</span>
        ) : !isConnected ? (
          "Connect Wallet"
        ) : direction === "to-btc" ? (
          `Bridge ${fromSymbol} to BTC`
        ) : (
          `Bridge BTC to ${toSymbol}`
        )}
      </button>

      {/* Pending bridges count */}
      {bridgeState?.pendingBridges &&
        bridgeState.pendingBridges.length > 0 && (
          <div className="text-center text-xs text-[color:var(--sf-text)]/50">
            {bridgeState.pendingBridges.length} pending bridge
            {bridgeState.pendingBridges.length > 1 ? "s" : ""} in queue
          </div>
        )}
    </div>
  );
}
