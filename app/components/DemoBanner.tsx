'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import LanguageToggle from './LanguageToggle';

const DISMISS_KEY = 'sf-demo-banner-dismissed';

export default function DemoBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={handleDismiss}
    >
      <div
        className="w-[480px] max-w-[92vw] overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-[400ms]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Demo Notice"
      >
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
              {t('demo.warning')}
            </h2>
            <LanguageToggle />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/60 whitespace-pre-line">
            {t('demo.description')}
          </p>

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
            >
              {t('demo.understand')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
