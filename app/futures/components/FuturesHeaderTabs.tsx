"use client";

import { useTranslation } from '@/hooks/useTranslation';

export type FuturesTabKey = "futures" | "predictions" | "volatility";

type Props = {
  activeTab: FuturesTabKey;
  onTabChange: (tab: FuturesTabKey) => void;
};

const tabs: { key: FuturesTabKey; labelKey: string; fallback: string }[] = [
  { key: 'futures', labelKey: 'futuresTabs.futures', fallback: 'FUTURES' },
  { key: 'predictions', labelKey: 'futuresTabs.predictions', fallback: 'PREDICTIONS' },
  { key: 'volatility', labelKey: 'futuresTabs.volatility', fallback: 'VOLATILITY' },
];

export default function FuturesHeaderTabs({ activeTab, onTabChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="relative inline-flex items-center gap-1 sm:gap-2 p-1 rounded-lg">
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          className={`relative z-10 px-3 py-1.5 sm:px-6 sm:py-2 text-[10px] sm:text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none rounded-md shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
            activeTab === tab.key
              ? "bg-[color:var(--sf-primary)] text-white shadow-lg"
              : "bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]"
          }`}
          onClick={() => onTabChange(tab.key)}
        >
          {t(tab.labelKey) || tab.fallback}
        </button>
      ))}
    </div>
  );
}
