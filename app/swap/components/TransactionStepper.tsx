/**
 * TransactionStepper Component
 *
 * JOURNAL (2026-03-15): Created to provide clear visual feedback during multi-step
 * swap operations (BTC → Token requires wrap then swap, Token → BTC requires swap then unwrap).
 *
 * Key insight from plan research: Signature batching is NOT possible due to UTXO dependency chain.
 * The swap PSBT cannot be constructed until the wrap tx is broadcast (txid unknown beforehand).
 * Therefore, users MUST see two signing prompts. This component makes that clear.
 *
 * Usage:
 * <TransactionStepper
 *   steps={[
 *     { label: 'Wrap BTC → frBTC', status: 'complete', txId: 'abc123' },
 *     { label: 'Swap frBTC → DIESEL', status: 'loading', pollingAttempt: 3, maxAttempts: 20 },
 *   ]}
 *   currentStepIndex={1}
 * />
 */

import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export type StepStatus = 'pending' | 'loading' | 'confirming' | 'complete' | 'error';

export interface TransactionStep {
  /** Human-readable step label */
  label: string;
  /** Current status of this step */
  status: StepStatus;
  /** Transaction ID if broadcast */
  txId?: string;
  /** For 'confirming' status: current polling attempt */
  pollingAttempt?: number;
  /** For 'confirming' status: maximum polling attempts */
  maxAttempts?: number;
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Additional detail text (e.g., "Received 0.499 frBTC") */
  detail?: string;
}

export interface TransactionStepperProps {
  /** Array of steps in order */
  steps: TransactionStep[];
  /** Currently active step index (0-based) */
  currentStepIndex: number;
  /** Optional callback when user clicks "Retry" on a failed step */
  onRetry?: () => void;
  /** Optional callback when user clicks "View Transaction" */
  onViewTransaction?: (txId: string) => void;
  /** Network for block explorer links */
  network?: string;
}

/** Get block explorer URL for a transaction */
const getExplorerUrl = (txId: string, network?: string): string => {
  if (!network || network === 'mainnet') {
    return `https://mempool.space/tx/${txId}`;
  }
  if (network === 'testnet') {
    return `https://mempool.space/testnet/tx/${txId}`;
  }
  // Regtest networks - use local or subfrost explorer
  return `https://mempool.space/tx/${txId}`; // Fallback to mainnet explorer format
};

export default function TransactionStepper({
  steps,
  currentStepIndex,
  onRetry,
  onViewTransaction,
  network,
}: TransactionStepperProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full rounded-xl bg-[color:var(--sf-surface)] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-[color:var(--sf-text)]/70 font-medium">
          {t('swap.transactionProgress') || 'Transaction Progress'}
        </span>
        <span className="text-[color:var(--sf-text)]/50">
          {t('swap.stepOf', { current: currentStepIndex + 1, total: steps.length }) ||
           `Step ${currentStepIndex + 1}/${steps.length}`}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <StepRow
            key={index}
            step={step}
            stepNumber={index + 1}
            isActive={index === currentStepIndex}
            isPast={index < currentStepIndex}
            network={network}
            onRetry={step.status === 'error' ? onRetry : undefined}
            onViewTransaction={onViewTransaction}
          />
        ))}
      </div>
    </div>
  );
}

interface StepRowProps {
  step: TransactionStep;
  stepNumber: number;
  isActive: boolean;
  isPast: boolean;
  network?: string;
  onRetry?: () => void;
  onViewTransaction?: (txId: string) => void;
}

function StepRow({
  step,
  stepNumber,
  isActive,
  isPast,
  network,
  onRetry,
  onViewTransaction,
}: StepRowProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`
        flex items-start gap-3 p-3 rounded-lg transition-colors
        ${isActive ? 'bg-[color:var(--sf-primary)]/10' : ''}
        ${step.status === 'error' ? 'bg-red-500/10' : ''}
      `}
    >
      {/* Status Icon */}
      <div className="flex-shrink-0 mt-0.5">
        <StatusIcon status={step.status} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Label */}
        <div className="flex items-center gap-2">
          <span
            className={`
              text-sm font-medium
              ${step.status === 'complete' ? 'text-green-500' : ''}
              ${step.status === 'error' ? 'text-red-500' : ''}
              ${step.status === 'pending' ? 'text-[color:var(--sf-text)]/40' : ''}
              ${isActive && step.status !== 'error' ? 'text-[color:var(--sf-text)]' : ''}
              ${isPast && step.status !== 'complete' ? 'text-[color:var(--sf-text)]/60' : ''}
            `}
          >
            {step.label}
          </span>
        </div>

        {/* Status text / progress */}
        <div className="mt-1">
          {step.status === 'loading' && (
            <span className="text-xs text-[color:var(--sf-primary)]">
              {t('swap.broadcasting') || 'Broadcasting...'}
            </span>
          )}

          {step.status === 'confirming' && step.pollingAttempt !== undefined && (
            <div className="space-y-1">
              <span className="text-xs text-[color:var(--sf-text)]/60">
                {t('swap.waitingForConfirmation') || 'Waiting for confirmation...'}
                {step.maxAttempts && ` (${step.pollingAttempt}/${step.maxAttempts})`}
              </span>
              {/* Progress bar */}
              {step.maxAttempts && (
                <div className="w-full h-1 bg-[color:var(--sf-text)]/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[color:var(--sf-primary)] transition-all duration-300"
                    style={{ width: `${(step.pollingAttempt / step.maxAttempts) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {step.status === 'complete' && step.detail && (
            <span className="text-xs text-green-500/80">{step.detail}</span>
          )}

          {step.status === 'error' && step.errorMessage && (
            <span className="text-xs text-red-500/80">{step.errorMessage}</span>
          )}
        </div>

        {/* Transaction link */}
        {step.txId && (
          <a
            href={getExplorerUrl(step.txId, network)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (onViewTransaction) {
                e.preventDefault();
                onViewTransaction(step.txId!);
              }
            }}
            className="mt-1 inline-flex items-center gap-1 text-xs text-[color:var(--sf-primary)] hover:underline"
          >
            <span className="truncate max-w-[120px]">{step.txId.slice(0, 8)}...{step.txId.slice(-6)}</span>
            <ExternalLinkIcon />
          </a>
        )}

        {/* Retry button for errors */}
        {step.status === 'error' && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 px-3 py-1 text-xs font-medium rounded-lg bg-[color:var(--sf-primary)] text-white hover:bg-[color:var(--sf-primary)]/80 transition-colors"
          >
            {t('swap.retry') || 'Retry'}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'complete':
      return (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );

    case 'loading':
    case 'confirming':
      return (
        <div className="w-5 h-5 rounded-full border-2 border-[color:var(--sf-primary)] border-t-transparent animate-spin" />
      );

    case 'error':
      return (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </div>
      );

    case 'pending':
    default:
      return (
        <div className="w-5 h-5 rounded-full border-2 border-[color:var(--sf-text)]/20" />
      );
  }
}

function ExternalLinkIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
