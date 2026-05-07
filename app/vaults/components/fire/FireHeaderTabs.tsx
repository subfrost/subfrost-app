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
    <div className="overflow-x-auto -mx-1 px-1 -my-3 py-3 scrollbar-hide">
      <div className="sf-tab-group min-w-max" style={{ '--sf-tab-active-bg': '#f97316' } as React.CSSProperties}>
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            className={`sf-tab-btn px-6 py-2 text-sm ${
              activeTab === id ? 'sf-tab-btn--active' : ''
            }`}
          >
            {t(TAB_KEYS[id])}
          </button>
        ))}
      </div>
    </div>
  );
}
