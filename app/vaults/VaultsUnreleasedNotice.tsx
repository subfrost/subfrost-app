'use client';

import { useState } from 'react';
import LanguageToggle from '@/app/components/LanguageToggle';
import { useTranslation } from '@/hooks/useTranslation';
import { useDemoGate } from '@/hooks/useDemoGate';

export default function VaultsUnreleasedNotice() {
  const { t } = useTranslation();
  const isDemoGated = useDemoGate();
  const [dismissed, setDismissed] = useState(false);

  if (!isDemoGated || dismissed) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200"
      onClick={() => setDismissed(true)}
    >
      <div
        className="w-[480px] max-w-[92vw] overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-[400ms]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('vaults.unreleasedTitle')}
      >
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-extrabold uppercase text-[color:var(--sf-text)]">
              {t('vaults.unreleasedTitle')}
            </h2>
            <LanguageToggle />
          </div>
        </div>
        <div className="px-6 py-4">
          <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/60 whitespace-pre-line">
            {t('vaults.unreleasedDescription')}
          </p>
          <div className="mt-4 flex justify-center">
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
  );
}
