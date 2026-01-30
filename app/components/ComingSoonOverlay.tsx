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
        <div className="pointer-events-auto relative rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-xl border border-[color:var(--sf-glass-border)] shadow-[0_8px_32px_rgba(0,0,0,0.25)] px-8 py-6 max-w-md text-center">
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-2">
            {t('comingSoon.title')}
          </h3>
          <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/60">
            {t('comingSoon.description')}
          </p>
        </div>
      </div>
    </div>
  );
}
