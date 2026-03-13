'use client';

import { useTranslation } from '@/hooks/useTranslation';

export type FireTab = 'dashboard' | 'stake' | 'bond' | 'redeem' | 'distribute';

const TAB_IDS: FireTab[] = ['dashboard', 'stake', 'bond', 'redeem', 'distribute'];

const TAB_KEYS: Record<FireTab, string> = {
  dashboard: 'fire.tab.dashboard',
  stake: 'fire.tab.stake',
  bond: 'fire.tab.bond',
  redeem: 'fire.tab.redeem',
  distribute: 'fire.tab.distribute',
};

interface FireHeaderTabsProps {
  activeTab: FireTab;
  onTabChange: (tab: FireTab) => void;
}

export default function FireHeaderTabs({ activeTab, onTabChange }: FireHeaderTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
      <div className="inline-flex items-center gap-0.5 rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] p-1 min-w-max">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`rounded-xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] whitespace-nowrap ${
              activeTab === id
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_2px_12px_rgba(249,115,22,0.4)]'
                : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-panel-bg)]'
            }`}
          >
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
