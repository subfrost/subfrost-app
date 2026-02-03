'use client';

import { useEffect, useCallback } from 'react';
import { X, ArrowRight, ArrowDown, Loader2, AlertTriangle } from 'lucide-react';
import { useTransactionConfirm, type TransactionDetails } from '@/context/TransactionConfirmContext';
import { useTranslation } from '@/hooks/useTranslation';
import TokenIcon from './TokenIcon';

function formatAmount(amount: string | undefined, symbol: string | undefined): string {
  if (!amount) return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  // Format with appropriate decimals
  if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (num >= 1) return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return num.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function truncateAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function TransactionTypeIcon({ type }: { type: TransactionDetails['type'] }) {
  switch (type) {
    case 'swap':
      return (
        <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/30">
          <ArrowRight className="w-6 h-6 text-blue-400" />
        </div>
      );
    case 'wrap':
      return (
        <div className="p-3 rounded-xl bg-orange-500/20 border border-orange-500/30">
          <ArrowDown className="w-6 h-6 text-orange-400" />
        </div>
      );
    case 'unwrap':
      return (
        <div className="p-3 rounded-xl bg-orange-500/20 border border-orange-500/30">
          <ArrowDown className="w-6 h-6 text-orange-400 rotate-180" />
        </div>
      );
    case 'addLiquidity':
      return (
        <div className="p-3 rounded-xl bg-green-500/20 border border-green-500/30">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </div>
      );
    case 'removeLiquidity':
      return (
        <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
          </svg>
        </div>
      );
    case 'send':
      return (
        <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-500/30">
          <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

function SwapDetails({ details }: { details: TransactionDetails }) {
  return (
    <div className="space-y-3">
      {/* From */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-surface)]">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={details.fromSymbol || ''} id={details.fromId} size="lg" />
          <div>
            <div className="text-xs text-[color:var(--sf-text)]/60">You pay</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">
              {formatAmount(details.fromAmount, details.fromSymbol)} {details.fromSymbol}
            </div>
          </div>
        </div>
      </div>

      {/* Arrow */}
      <div className="flex justify-center">
        <div className="p-2 rounded-full bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)]">
          <ArrowDown className="w-4 h-4 text-[color:var(--sf-text)]/60" />
        </div>
      </div>

      {/* To */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-surface)]">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={details.toSymbol || ''} id={details.toId} size="lg" />
          <div>
            <div className="text-xs text-[color:var(--sf-text)]/60">You receive</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">
              {formatAmount(details.toAmount, details.toSymbol)} {details.toSymbol}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiquidityDetails({ details }: { details: TransactionDetails }) {
  const isAdd = details.type === 'addLiquidity';

  return (
    <div className="space-y-3">
      {isAdd ? (
        <>
          {/* Tokens being added */}
          <div className="p-3 rounded-lg bg-[color:var(--sf-surface)] space-y-2">
            <div className="text-xs text-[color:var(--sf-text)]/60">You deposit</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={details.token0Symbol || ''} id={details.token0Id} size="md" />
                <span className="font-medium text-[color:var(--sf-text)]">{details.token0Symbol}</span>
              </div>
              <span className="font-bold text-[color:var(--sf-text)]">
                {formatAmount(details.token0Amount, details.token0Symbol)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={details.token1Symbol || ''} id={details.token1Id} size="md" />
                <span className="font-medium text-[color:var(--sf-text)]">{details.token1Symbol}</span>
              </div>
              <span className="font-bold text-[color:var(--sf-text)]">
                {formatAmount(details.token1Amount, details.token1Symbol)}
              </span>
            </div>
          </div>
          {/* LP tokens received */}
          {details.lpAmount && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="text-xs text-green-400/80">You receive LP tokens</div>
              <div className="text-lg font-bold text-green-400">
                ~{formatAmount(details.lpAmount, 'LP')} LP
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* LP being burned */}
          <div className="p-3 rounded-lg bg-[color:var(--sf-surface)]">
            <div className="text-xs text-[color:var(--sf-text)]/60">You burn</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">
              {formatAmount(details.lpAmount, 'LP')} LP tokens
            </div>
            {details.poolName && (
              <div className="text-sm text-[color:var(--sf-text)]/60">{details.poolName}</div>
            )}
          </div>
          {/* Tokens received */}
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-2">
            <div className="text-xs text-green-400/80">You receive</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={details.token0Symbol || ''} id={details.token0Id} size="md" />
                <span className="font-medium text-green-400">{details.token0Symbol}</span>
              </div>
              <span className="font-bold text-green-400">
                ~{formatAmount(details.token0Amount, details.token0Symbol)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TokenIcon symbol={details.token1Symbol || ''} id={details.token1Id} size="md" />
                <span className="font-medium text-green-400">{details.token1Symbol}</span>
              </div>
              <span className="font-bold text-green-400">
                ~{formatAmount(details.token1Amount, details.token1Symbol)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SendDetails({ details }: { details: TransactionDetails }) {
  return (
    <div className="space-y-3">
      <div className="p-3 rounded-lg bg-[color:var(--sf-surface)]">
        <div className="text-xs text-[color:var(--sf-text)]/60">Amount</div>
        <div className="flex items-center gap-3 mt-1">
          <TokenIcon symbol={details.fromSymbol || ''} id={details.fromId} size="lg" />
          <div className="text-lg font-bold text-[color:var(--sf-text)]">
            {formatAmount(details.fromAmount, details.fromSymbol)} {details.fromSymbol}
          </div>
        </div>
      </div>
      {details.recipient && (
        <div className="p-3 rounded-lg bg-[color:var(--sf-surface)]">
          <div className="text-xs text-[color:var(--sf-text)]/60">To</div>
          <div className="text-sm font-mono text-[color:var(--sf-text)] mt-1 break-all">
            {details.recipient}
          </div>
        </div>
      )}
    </div>
  );
}

function WrapUnwrapDetails({ details }: { details: TransactionDetails }) {
  const isWrap = details.type === 'wrap';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-surface)]">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={isWrap ? 'BTC' : 'frBTC'} size="lg" />
          <div>
            <div className="text-xs text-[color:var(--sf-text)]/60">You {isWrap ? 'wrap' : 'unwrap'}</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)]">
              {formatAmount(details.fromAmount, details.fromSymbol)} {isWrap ? 'BTC' : 'frBTC'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="p-2 rounded-full bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)]">
          <ArrowDown className="w-4 h-4 text-[color:var(--sf-text)]/60" />
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={isWrap ? 'frBTC' : 'BTC'} size="lg" />
          <div>
            <div className="text-xs text-green-400/80">You receive</div>
            <div className="text-lg font-bold text-green-400">
              {formatAmount(details.toAmount, details.toSymbol)} {isWrap ? 'frBTC' : 'BTC'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TransactionConfirmModal() {
  const { t } = useTranslation();
  const { pendingTransaction, approve, reject } = useTransactionConfirm();

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && pendingTransaction) {
      reject();
    }
  }, [pendingTransaction, reject]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!pendingTransaction) return null;

  const { details } = pendingTransaction;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={reject}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-[color:var(--sf-panel-bg)] shadow-2xl border border-[color:var(--sf-outline)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[color:var(--sf-outline)]">
          <div className="flex items-center gap-3">
            <TransactionTypeIcon type={details.type} />
            <div>
              <h2 className="text-lg font-bold text-[color:var(--sf-text)]">
                {details.title}
              </h2>
              {details.description && (
                <p className="text-sm text-[color:var(--sf-text)]/60">
                  {details.description}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={reject}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-surface)] transition-colors"
          >
            <X className="w-5 h-5 text-[color:var(--sf-text)]/60" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Transaction details based on type */}
          {details.type === 'swap' && <SwapDetails details={details} />}
          {details.type === 'wrap' && <WrapUnwrapDetails details={details} />}
          {details.type === 'unwrap' && <WrapUnwrapDetails details={details} />}
          {(details.type === 'addLiquidity' || details.type === 'removeLiquidity') && (
            <LiquidityDetails details={details} />
          )}
          {details.type === 'send' && <SendDetails details={details} />}

          {/* Fee info */}
          {(details.feeRate || details.estimatedFee) && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-surface)] text-sm">
              <span className="text-[color:var(--sf-text)]/60">Network fee</span>
              <span className="text-[color:var(--sf-text)]">
                {details.estimatedFee ? `~${details.estimatedFee} sats` : `${details.feeRate} sat/vB`}
              </span>
            </div>
          )}

          {/* Warning */}
          <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200/80">
              Review the transaction details carefully. This action cannot be undone once confirmed.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 p-4 border-t border-[color:var(--sf-outline)]">
          <button
            onClick={reject}
            className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] font-semibold hover:bg-[color:var(--sf-surface)]/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={approve}
            className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] text-white font-semibold hover:shadow-lg transition-all"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
