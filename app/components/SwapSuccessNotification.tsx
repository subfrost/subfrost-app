"use client";

import { useEffect, useState } from "react";
import { Minus, Send } from "lucide-react";
import Link from "next/link";
import { useTranslation } from '@/hooks/useTranslation';

export type OperationType = 'swap' | 'wrap' | 'unwrap' | 'addLiquidity' | 'removeLiquidity' | 'send';

type Props = {
  txId: string;
  onClose: () => void;
  operationType?: OperationType;
};

export default function SwapSuccessNotification({ txId, onClose, operationType = 'swap' }: Props) {
  const { t } = useTranslation();
  const [isFlashing, setIsFlashing] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const OPERATION_LABELS: Record<OperationType, string> = {
    swap: t('success.swap'),
    wrap: t('success.wrap'),
    unwrap: t('success.unwrap'),
    addLiquidity: t('success.addLiquidity'),
    removeLiquidity: t('success.removeLiquidity'),
    send: t('success.send'),
  };

  const operationLabel = OPERATION_LABELS[operationType];

  useEffect(() => {
    // Start animations
    requestAnimationFrame(() => setIsVisible(true));

    // End flash after 400ms
    const flashTimer = setTimeout(() => setIsFlashing(false), 400);

    // Auto-collapse after 5 seconds (instead of dismiss)
    const collapseTimer = setTimeout(() => {
      setIsExpanded(false);
    }, 5000);

    return () => {
      clearTimeout(flashTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const handleCollapse = () => {
    setIsExpanded(false);
  };

  const handleExpand = () => {
    setIsExpanded(true);
  };

  return (
    <>
      {/* Flash overlay */}
      <div
        className={`fixed inset-0 z-[9998] bg-[color:var(--sf-primary)]/10 pointer-events-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
          isFlashing ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Collapsed circle - bottom right */}
      <div
        className={`fixed bottom-6 right-6 z-[9999] transition-all duration-300 ease-out ${
          isVisible && !isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
        }`}
      >
        <button
          onClick={handleExpand}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--sf-info-green-border)] bg-[color:var(--sf-info-green-bg)] shadow-[0_4px_20px_rgba(34,197,94,0.3)] hover:shadow-[0_6px_28px_rgba(34,197,94,0.4)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
          aria-label="Expand swap notification"
        >
          <div className="flex gap-0.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--sf-info-green-title)] animate-pulse" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--sf-info-green-title)] animate-pulse [animation-delay:200ms]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--sf-info-green-title)] animate-pulse [animation-delay:400ms]" />
          </div>
        </button>
      </div>

      {/* Expanded notification - above the circle in bottom right */}
      <div
        className={`fixed bottom-20 right-6 z-[9999] w-full max-w-[340px] transition-all duration-300 ease-out ${
          isVisible && isExpanded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <div className="relative rounded-2xl border border-[color:var(--sf-info-green-border)] bg-[color:var(--sf-info-green-bg)] p-4 shadow-[0_12px_48px_rgba(34,197,94,0.25)] backdrop-blur-xl">
          {/* Send icon */}
          <Send size={18} className="absolute top-4 left-4 text-[color:var(--sf-info-green-title)]" strokeWidth={2.5} />

          {/* Content */}
          <div className="ml-8 pr-16">
            <h3 className="text-base font-bold text-[color:var(--sf-info-green-title)] mb-1">{t('success.submitted', { operation: operationLabel })}</h3>
            <div className="text-sm text-[color:var(--sf-info-green-text)]">
              {t('success.transactionId')}{" "}
              <Link
                href={`https://espo.sh/tx/${txId}`}
                target="_blank"
                className="font-semibold text-xs break-all hover:underline"
              >
                {txId}
              </Link>
            </div>
          </div>

          {/* Action buttons */}
          <div className="absolute top-3 right-3 flex items-center gap-1">
            {/* Collapse button */}
            <button
              onClick={handleCollapse}
              className="flex h-6 w-6 items-center justify-center rounded-full transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-info-green-border)] focus:outline-none"
              aria-label="Collapse"
            >
              <Minus size={14} className="text-[color:var(--sf-info-green-title)]" strokeWidth={2.5} />
            </button>

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="flex h-6 w-6 items-center justify-center rounded-full transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-info-green-border)] focus:outline-none"
              aria-label="Dismiss"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[color:var(--sf-info-green-title)]"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
