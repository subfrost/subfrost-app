'use client';

import { useState, type ReactNode } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useWallet } from '@/context/WalletContext';
import LanguageToggle from './LanguageToggle';

type FeaturePage = 'swap' | 'vaults' | 'futures';

interface MainnetFeatureNoticeProps {
  children: ReactNode;
  feature: FeaturePage;
}

/**
 * Shows a "COMING SOON" notice overlay when on mainnet for feature pages.
 * Smaller than the main DemoBanner, with page-specific messaging.
 */
export default function MainnetFeatureNotice({ children, feature }: MainnetFeatureNoticeProps) {
  const { t } = useTranslation();
  const { network } = useWallet();
  const [dismissed, setDismissed] = useState(false);

  const isMainnet = network === 'mainnet';

  const handleDismiss = () => {
    setDismissed(true);
  };

  // Only show on mainnet and when not dismissed
  if (!isMainnet || dismissed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Grayed-out page content */}
      <div className="opacity-40 pointer-events-none select-none" aria-hidden>
        {children}
      </div>

      {/* Centered notice - smaller than the main DemoBanner */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 pointer-events-none">
        <div className="pointer-events-auto w-[380px] max-w-[90vw] overflow-hidden rounded-2xl bg-[color:var(--sf-glass-bg)] shadow-[0_16px_64px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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
          <div className="px-5 py-3">
            <p className="text-sm leading-relaxed text-[color:var(--sf-text)]/60 whitespace-pre-line">
              {t(`featureNotice.${feature}`)}
            </p>

            <div className="mt-3">
              <button
                type="button"
                onClick={handleDismiss}
                className="w-full rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-2 text-xs font-bold uppercase tracking-wide text-white shadow-[0_2px_6px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_3px_10px_rgba(0,0,0,0.2)]"
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
