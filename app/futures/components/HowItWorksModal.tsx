'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

type HowItWorksModalProps = {
  onClose: () => void;
};

export default function HowItWorksModal({ onClose }: HowItWorksModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="shrink-0 bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)] rounded-t-3xl flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{t('howItWorks.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {/* Block 1: Buy */}
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <h3 className="text-lg font-semibold text-[color:var(--sf-text)] mb-3">{t('howItWorks.buy')}</h3>
              <p className="text-sm text-[color:var(--sf-text)]/80 mb-4">
                {t('howItWorks.buyDesc')}
              </p>
              <div className="space-y-2 text-xs text-[color:var(--sf-text)]/70">
                <div>
                  {t('howItWorks.buyExample')}
                </div>
                <div>
                  {t('howItWorks.expiry')}
                </div>
              </div>
            </div>

            {/* Block 2: Hold */}
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <h3 className="text-lg font-semibold text-[color:var(--sf-text)] mb-3">{t('howItWorks.hold')}</h3>
              <p className="text-sm text-[color:var(--sf-text)]/80 mb-4">
                {t('howItWorks.holdDesc')}
              </p>
              <div className="space-y-2 text-xs text-[color:var(--sf-text)]/70">
                <div>
                  {t('howItWorks.todayValue')}
                </div>
                <div>
                  {t('howItWorks.discount')}
                </div>
              </div>
            </div>

            {/* Block 3: Exercise */}
            <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-4 sm:p-6 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <h3 className="text-lg font-semibold text-[color:var(--sf-text)] mb-3">{t('howItWorks.exercise')}</h3>
              <p className="text-sm text-[color:var(--sf-text)]/80 mb-4">
                {t('howItWorks.exerciseDesc')}
              </p>
              <div className="space-y-2 text-xs text-[color:var(--sf-text)]/70">
                <div>
                  {t('howItWorks.exerciseNow')}
                </div>
                <div>
                  {t('howItWorks.atExpiry')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

