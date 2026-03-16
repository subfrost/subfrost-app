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
      <div className="relative inline-flex items-center gap-2 p-1 min-w-max">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`relative z-10 px-6 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none rounded-md whitespace-nowrap shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${
              activeTab === id
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg'
                : 'bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]'
            }`}
          >
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
