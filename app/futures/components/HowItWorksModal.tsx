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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4 rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">{t('howItWorks.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[color:var(--sf-text)]"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Block 1: Buy */}
            <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
              <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-3">{t('howItWorks.buy')}</h3>
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
            <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
              <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-3">{t('howItWorks.hold')}</h3>
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
            <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
              <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-3">{t('howItWorks.exercise')}</h3>
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

