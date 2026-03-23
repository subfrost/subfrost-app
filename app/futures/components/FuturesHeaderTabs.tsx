"use client";

import { useTranslation } from '@/hooks/useTranslation';

export type FuturesTabKey = "futures" | "predictions" | "volatility" | "yield" | "difficulty";

type Props = {
  activeTab: FuturesTabKey;
  onTabChange: (tab: FuturesTabKey) => void;
};

const tabs: { key: FuturesTabKey; labelKey: string; fallback: string }[] = [
  { key: 'futures', labelKey: 'futuresTabs.futures', fallback: 'FUTURES' },
  { key: 'predictions', labelKey: 'futuresTabs.predictions', fallback: 'PREDICTIONS' },
  { key: 'volatility', labelKey: 'futuresTabs.volatility', fallback: 'VOLATILITY' },
  { key: 'yield', labelKey: 'futuresTabs.yieldFutures', fallback: 'YIELD FUTURES' },
  { key: 'difficulty', labelKey: 'futuresTabs.difficulty', fallback: 'DIFFICULTY' },
];

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="sf-tab-group">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          className={`sf-tab-btn sm:px-6 sm:py-2 sm:text-sm ${activeTab === tab.key ? 'sf-tab-btn--active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {t(tab.labelKey) || tab.fallback}
        </button>
      ))}
    </div>
  );
}
