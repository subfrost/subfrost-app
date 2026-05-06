"use client";

import { useTranslation } from '@/hooks/useTranslation';
import { useDemoGate } from '@/hooks/useDemoGate';

export type FuturesTabKey = "futures" | "predictions" | "volatility";

type Props = {
  activeTab: FuturesTabKey;
  onTabChange: (tab: FuturesTabKey) => void;
};

const tabs: { key: FuturesTabKey; labelKey: string; fallback: string; gated?: boolean }[] = [
  { key: 'futures', labelKey: 'futuresTabs.futures', fallback: 'FUTURES' },
  { key: 'volatility', labelKey: 'futuresTabs.volatility', fallback: 'VOLATILITY' },
  { key: 'predictions', labelKey: 'futuresTabs.predictions', fallback: 'PREDICTIONS', gated: true },
];

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  const isDemoGated = useDemoGate();
  return (
    <div className="sf-tab-group flex-1">
      {tabs.map(tab => {
        const disabled = !!tab.gated && isDemoGated;
        return (
          <button
            key={tab.key}
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            className={`sf-tab-btn flex-1 sm:px-6 sm:py-2 sm:text-sm ${activeTab === tab.key ? 'sf-tab-btn--active' : ''} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
            onClick={() => { if (!disabled) onTabChange(tab.key); }}
          >
            {t(tab.labelKey) || tab.fallback}
          </button>
        );
      })}
    </div>
  );
}
