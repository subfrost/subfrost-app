'use client';

import type { ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

export default function ComingSoonOverlay({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      {/* Grayed-out page content */}
      <div className="opacity-40 pointer-events-none select-none" aria-hidden>
        {children}
      </div>

      {/* Centered notice */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-24 pointer-events-none">
        <div className="pointer-events-auto rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-xl border border-[color:var(--sf-glass-border)] shadow-[0_8px_32px_rgba(0,0,0,0.25)] px-8 py-6 max-w-md text-center">
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
