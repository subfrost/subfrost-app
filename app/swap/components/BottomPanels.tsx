'use client';

import { useState, lazy, Suspense } from 'react';
import { BarChart3, Layers, Clock, Activity } from 'lucide-react';

const RecentTradesPanel = lazy(() => import('./RecentTradesPanel'));
const MyWalletSwaps = lazy(() => import('./MyWalletSwaps'));

type PanelTab = 'orders' | 'positions' | 'trades' | 'activity';

interface Props {
  baseToken: string;
  quoteToken: string;
}

export default function BottomPanels({ baseToken, quoteToken }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('trades');

  const tabs: { key: PanelTab; label: string; icon: React.ReactNode }[] = [
    { key: 'orders', label: 'Open Orders', icon: <Layers size={12} /> },
    { key: 'positions', label: 'Positions', icon: <BarChart3 size={12} /> },
    { key: 'trades', label: 'Trades', icon: <Clock size={12} /> },
    { key: 'activity', label: 'Activity', icon: <Activity size={12} /> },
  ];

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] border border-[color:var(--sf-glass-border)] shadow-sm overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-[color:var(--sf-glass-border)]">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              activeTab === tab.key
                ? 'text-[color:var(--sf-text)] border-b-2 border-[color:var(--sf-primary)]'
                : 'text-[color:var(--sf-text)]/25 hover:text-[color:var(--sf-text)]/50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="min-h-[120px] max-h-[250px] overflow-y-auto">
        <Suspense fallback={<div className="p-6 text-center text-xs text-[color:var(--sf-text)]/20 animate-pulse">Loading...</div>}>
          {activeTab === 'orders' && (
            <div className="p-4 text-center text-xs text-[color:var(--sf-text)]/25">
              <Layers className="h-6 w-6 mx-auto mb-2 opacity-30" />
              No open orders
            </div>
          )}

          {activeTab === 'positions' && (
            <div className="p-4 text-center text-xs text-[color:var(--sf-text)]/25">
              <BarChart3 className="h-6 w-6 mx-auto mb-2 opacity-30" />
              No LP positions
            </div>
          )}

          {activeTab === 'trades' && (
            <RecentTradesPanel baseToken={baseToken} quoteToken={quoteToken} />
          )}

          {activeTab === 'activity' && (
            <MyWalletSwaps />
          )}
        </Suspense>
      </div>
    </div>
  );
}
