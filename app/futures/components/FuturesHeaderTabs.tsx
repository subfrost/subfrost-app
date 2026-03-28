"use client";

import { useTranslation } from '@/hooks/useTranslation';

export type FuturesTabKey = "futures" | "predictions" | "volatility";

type Props = {
  activeTab: FuturesTabKey;
  onTabChange: (tab: FuturesTabKey) => void;
};

const tabs: { key: FuturesTabKey; labelKey: string; fallback: string }[] = [
  { key: 'futures', labelKey: 'futuresTabs.futures', fallback: 'FUTURES' },
  { key: 'volatility', labelKey: 'futuresTabs.volatility', fallback: 'VOLATILITY' },
  { key: 'predictions', labelKey: 'futuresTabs.predictions', fallback: 'PREDICTIONS' },
];

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="sf-tab-group flex-1">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          className={`sf-tab-btn flex-1 sm:px-6 sm:py-2 sm:text-sm ${activeTab === tab.key ? 'sf-tab-btn--active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {t(tab.labelKey) || tab.fallback}
        </button>
      ))}
    </div>
  );
}
