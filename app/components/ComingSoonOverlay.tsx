'use client';

import { useState, type ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export default function ComingSoonOverlay({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Grayed-out page content */}
      <div className="opacity-40 pointer-events-none select-none" aria-hidden>
        {children}
      </div>

      {/* Centered notice */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-24 pointer-events-none">
        <div className="pointer-events-auto w-[480px] max-w-[92vw] overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {/* Header */}
          {/* Header */}
          <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <h3 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
              {t('comingSoon.title')}
            </h3>
          </div>
          {/* Content */}
          <div className="px-6 py-4">
            <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/60">
              {t('comingSoon.description')}
            </p>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                {t('demo.understand')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
