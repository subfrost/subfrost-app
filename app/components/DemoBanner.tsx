'use client';

import { useState, useEffect } from 'react';

const DISMISS_KEY = 'sf-demo-banner-dismissed';

export default function DemoBanner() {
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
        {/* Body */}
        <div className="flex flex-col gap-4 p-6">
          <section className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <h3 className="text-base font-bold text-[color:var(--sf-text)]">
              The SUBFROST App is unreleased.
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--sf-text)]/60">
              Do not perform transactions until we officially release it. Anything you see here is subject to change.
            </p>
          </section>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleDismiss}
              className="rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-xl hover:scale-105 active:scale-95"
            >
              I Understand
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
