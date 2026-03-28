'use client';

/**
 * CrossChainConfirmModal -- Confirmation modal for cross-chain bridge swaps.
 *
 * Shows the full bridge route, amounts, fee breakdown, and destination
 * address before the user commits to the transaction. Displayed as an
 * overlay after the user clicks the primary CTA in CrossChainBridgePanel.
 *
 * JOURNAL (2026-03-27): Initial implementation.
 * Follows the same sf-* design system as the rest of the swap UI.
 * No raw borders on cards/panels/inputs.
 */

import React, { useMemo } from 'react';
import { ArrowRight, ArrowDown, X, AlertCircle, Shield } from 'lucide-react';

// ---- Types ----

export interface BridgeFeeBreakdown {
  /** Protocol fee label + value */
  protocolFee: string;
  /** Synth pool swap fee label + value */
  synthPoolFee: string;
  /** Wrap or unwrap fee label + value */
  wrapFee: string;
}

export interface CrossChainConfirmModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Source chain */
  fromChain: string;
  /** Destination chain */
  toChain: string;
  /** Amount the user is sending (display string) */
  sendAmount: string;
  /** Estimated amount the user receives (display string) */
  receiveAmount: string;
  /** Destination address on the target chain */
  destinationAddress: string;
  /** Full bridge route steps, e.g. ['ETH', 'frETH', 'frBTC', 'BTC'] */
  routeSteps: string[];
  /** Fee breakdown for display */
  fees?: BridgeFeeBreakdown;
  /** Estimated time in minutes */
  estimatedMinutes?: number;
  /** Price impact percentage */
  priceImpact?: number;
  /** Whether the confirm action is loading */
  isConfirming?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Called when user cancels / closes */
  onCancel: () => void;
}

// ---- Helpers ----

function truncateAddr(addr: string, front: number = 10, back: number = 6): string {
  if (addr.length <= front + back + 3) return addr;
  return `${addr.slice(0, front)}...${addr.slice(-back)}`;
}

function formatChainLabel(chain: string): string {
  return chain.toUpperCase();
}

// ---- Component ----

export function CrossChainConfirmModal({
  open,
  fromChain,
  toChain,
  sendAmount,
  receiveAmount,
  destinationAddress,
  routeSteps,
  fees,
  estimatedMinutes,
  priceImpact,
  isConfirming,
  onConfirm,
  onCancel,
}: CrossChainConfirmModalProps) {
  const highImpact = (priceImpact ?? 0) > 1;

  if (!open) return null;

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {/* Modal card */}
      <div className="sf-card w-full max-w-md p-0 overflow-hidden">
        {/* Header */}
        <div className="sf-card-header">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">
            Confirm Bridge
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors"
          >
            <X size={16} className="text-[color:var(--sf-text)]/60" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Send / Receive summary */}
          <div className="space-y-2">
            {/* Send */}
            <div className="sf-panel p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--sf-text)]/50 block">
                  You Send
                </span>
                <span className="text-xl font-bold text-[color:var(--sf-text)]">
                  {sendAmount} {formatChainLabel(fromChain)}
                </span>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center -my-1">
              <div className="w-8 h-8 rounded-full bg-[color:var(--sf-surface)] flex items-center justify-center">
                <ArrowDown size={16} className="text-[color:var(--sf-primary)]" />
              </div>
            </div>

            {/* Receive */}
            <div className="sf-panel p-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--sf-text)]/50 block">
                  You Receive
                </span>
                <span className="text-xl font-bold text-[color:var(--sf-text)]">
                  ~{receiveAmount} {formatChainLabel(toChain)}
                </span>
              </div>
            </div>
          </div>

          {/* Route visualization */}
          <div className="sf-panel p-3">
            <span className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--sf-text)]/50 block mb-2">
              Route
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {routeSteps.map((routeStep, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <ArrowRight
                      size={12}
                      className="text-[color:var(--sf-primary)]/60 flex-shrink-0"
                    />
                  )}
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                      i === 0 || i === routeSteps.length - 1
                        ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                        : 'bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/60'
                    }`}
                  >
                    {routeStep}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Destination address */}
          <div className="sf-panel p-3">
            <span className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--sf-text)]/50 block mb-1">
              Destination ({formatChainLabel(toChain)})
            </span>
            <span className="text-sm font-mono text-[color:var(--sf-text)]/80 break-all">
              {truncateAddr(destinationAddress, 14, 8)}
            </span>
          </div>

          {/* Fee breakdown */}
          {fees && (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--sf-text)]/60">Protocol Fee</span>
                <span className="font-medium text-[color:var(--sf-text)]/80">
                  {fees.protocolFee}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--sf-text)]/60">Synth Pool</span>
                <span className="font-medium text-[color:var(--sf-text)]/80">
                  {fees.synthPoolFee}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--sf-text)]/60">Wrap/Unwrap Fee</span>
                <span className="font-medium text-[color:var(--sf-text)]/80">
                  {fees.wrapFee}
                </span>
              </div>
            </div>
          )}

          {/* Estimated time */}
          {estimatedMinutes != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-[color:var(--sf-text)]/60">Estimated Time</span>
              <span className="text-[color:var(--sf-text)]/80">
                ~{estimatedMinutes} min
              </span>
            </div>
          )}

          {/* Price impact warning */}
          {highImpact && (
            <div className="sf-alert sf-alert-orange text-xs">
              <div className="flex items-start gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  Price impact is high ({priceImpact?.toFixed(2)}%). You may
                  receive significantly less than expected.
                </span>
              </div>
            </div>
          )}

          {/* Security notice */}
          <div className="flex items-center gap-2 text-[10px] text-[color:var(--sf-text)]/40">
            <Shield size={12} className="flex-shrink-0" />
            <span>
              Cross-chain swaps are secured by FROST threshold signatures.
              Funds are held in coordinator vaults during transit.
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              className="sf-btn-secondary flex-1"
              onClick={onCancel}
              disabled={isConfirming}
            >
              Cancel
            </button>
            <button
              className="sf-btn-primary flex-1"
              onClick={onConfirm}
              disabled={isConfirming}
            >
              {isConfirming ? 'Confirming...' : 'Confirm Bridge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CrossChainConfirmModal;
