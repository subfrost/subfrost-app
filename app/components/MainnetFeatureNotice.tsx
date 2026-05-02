'use client';

import { useState, type ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useDemoGate } from '@/hooks/useDemoGate';
import LanguageToggle from './LanguageToggle';

type FeaturePage = 'swap' | 'vaults' | 'futures';

interface MainnetFeatureNoticeProps {
  children: ReactNode;
  feature: FeaturePage;
}

const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

/**
 * Switch the app to devnet. The network change triggers DevnetProvider's
 * auto-boot effect (see context/DevnetContext.tsx) which loads WASMs and
 * deploys contracts in-browser. The DevnetBootModal renders the progress.
 */
function enterDevnetDemo() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NETWORK_STORAGE_KEY, 'devnet');
  window.dispatchEvent(new CustomEvent('network-changed', { detail: 'devnet' }));
}

/**
 * Shown when demo-gated (NEXT_PUBLIC_DEMO_MODE=1 + mainnet, non-OKX/UniSat
 * wallet). Offers a single CTA to switch into the in-browser devnet so the
 * user can try the gated feature without real funds.
 */
export default function MainnetFeatureNotice({ children, feature }: MainnetFeatureNoticeProps) {
  const { t } = useTranslation();
  const isDemoGated = useDemoGate();
  const [dismissed, setDismissed] = useState(false);

  if (!isDemoGated || dismissed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Grayed-out page content */}
      <div className="opacity-40 pointer-events-none select-none" aria-hidden>
        {children}
      </div>

      {/* Centered CTA */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 pointer-events-none">
        <div className="pointer-events-auto w-[420px] max-w-[92vw] overflow-hidden rounded-2xl bg-[color:var(--sf-glass-bg)] shadow-[0_16px_64px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {/* Header */}
          <div className="bg-[color:var(--sf-panel-bg)] px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
                {t('featureNotice.title')}
              </h3>
              <LanguageToggle />
            </div>
          </div>
          {/* Content */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/70 whitespace-pre-line">
              {t(`featureNotice.${feature}`)}
            </p>

            <button
              type="button"
              onClick={enterDevnetDemo}
              className="w-full rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
            >
              {t('featureNotice.enterDevnet')}
            </button>

            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="w-full text-xs font-medium text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] py-1 transition-colors"
            >
              {t('featureNotice.stayOnMainnet')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
