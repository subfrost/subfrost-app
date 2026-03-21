'use client';

import { useState, lazy, Suspense, useMemo } from 'react';
import { BarChart3, Layers, Clock, Activity, ExternalLink } from 'lucide-react';
import { useLPPositions } from '@/hooks/useLPPositions';
import { useOrderbook } from '@/hooks/useOrderbook';
import { useWallet } from '@/context/WalletContext';

const RecentTradesPanel = lazy(() => import('./RecentTradesPanel'));
const MyWalletSwaps = lazy(() => import('./MyWalletSwaps'));

type PanelTab = 'orders' | 'positions' | 'trades' | 'activity';

interface Props {
  baseToken: string;
  quoteToken: string;
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-[color:var(--sf-text)]/20">
      <Icon className="h-6 w-6 mb-2" />
      <span className="text-xs">{message}</span>
    </div>
  );
}

export default function BottomPanels({ baseToken, quoteToken }: Props) {
  const [activeTab, setActiveTab] = useState<PanelTab>('trades');
  const { isConnected } = useWallet();
  const { positions: lpPositions, isLoading: isLoadingPositions } = useLPPositions();

  // Mock open orders count — will connect to carbine controller
  const openOrderCount = 0;

  const tabs: { key: PanelTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'orders', label: 'Open Orders', icon: <Layers size={12} />, count: openOrderCount },
    { key: 'positions', label: 'Positions', icon: <BarChart3 size={12} />, count: lpPositions.length },
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
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              activeTab === tab.key
                ? 'text-[color:var(--sf-text)] border-b-2 border-[color:var(--sf-primary)]'
                : 'text-[color:var(--sf-text)]/25 hover:text-[color:var(--sf-text)]/50'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="min-h-[100px] max-h-[280px] overflow-y-auto">
        <Suspense fallback={<div className="p-6 text-center text-xs text-[color:var(--sf-text)]/20 animate-pulse">Loading...</div>}>

          {/* Open Orders */}
          {activeTab === 'orders' && (
            !isConnected ? (
              <EmptyState icon={Layers} message="Connect wallet to view orders" />
            ) : openOrderCount === 0 ? (
              <EmptyState icon={Layers} message="No open orders" />
            ) : (
              <div className="p-3">
                {/* TODO: Render carbine orders from useOrderbook */}
              </div>
            )
          )}

          {/* LP Positions */}
          {activeTab === 'positions' && (
            !isConnected ? (
              <EmptyState icon={BarChart3} message="Connect wallet to view positions" />
            ) : isLoadingPositions ? (
              <div className="p-6 text-center text-xs text-[color:var(--sf-text)]/20 animate-pulse">Loading positions...</div>
            ) : lpPositions.length === 0 ? (
              <EmptyState icon={BarChart3} message="No LP positions" />
            ) : (
              <div className="divide-y divide-[color:var(--sf-glass-border)]/20">
                {/* Header */}
                <div className="grid grid-cols-5 gap-2 px-3 py-2 text-[10px] text-[color:var(--sf-text)]/30 uppercase tracking-wider">
                  <span className="col-span-2">Pool</span>
                  <span className="text-right">Shares</span>
                  <span className="text-right">Value</span>
                  <span className="text-right">P/L</span>
                </div>
                {lpPositions.map((pos) => (
                  <div key={pos.id} className="grid grid-cols-5 gap-2 px-3 py-2.5 hover:bg-white/[0.02] transition-colors items-center">
                    <div className="col-span-2 flex items-center gap-2">
                      <div className="flex -space-x-1">
                        <div className="w-5 h-5 rounded-full bg-[color:var(--sf-primary)]/20 border border-[color:var(--sf-glass-border)] flex items-center justify-center text-[7px] font-bold text-[color:var(--sf-primary)]">
                          {pos.token0Symbol?.charAt(0) || '?'}
                        </div>
                        <div className="w-5 h-5 rounded-full bg-[color:var(--sf-surface)] border border-[color:var(--sf-glass-border)] flex items-center justify-center text-[7px] font-bold text-[color:var(--sf-text)]/50">
                          {pos.token1Symbol?.charAt(0) || '?'}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-[color:var(--sf-text)]/80 truncate">
                        {pos.token0Symbol}/{pos.token1Symbol}
                      </span>
                    </div>
                    <span className="text-[11px] text-right font-mono tabular-nums text-[color:var(--sf-text)]/60">
                      {pos.amount || '--'}
                    </span>
                    <span className="text-[11px] text-right font-mono tabular-nums text-[color:var(--sf-text)]/60">
                      {pos.valueUSD > 0 ? `$${pos.valueUSD.toFixed(2)}` : '--'}
                    </span>
                    <span className="text-[11px] text-right font-mono tabular-nums text-green-400/60">
                      --
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Trades */}
          {activeTab === 'trades' && (
            <RecentTradesPanel baseToken={baseToken} quoteToken={quoteToken} />
          )}

          {/* Activity */}
          {activeTab === 'activity' && (
            <MyWalletSwaps />
          )}
        </Suspense>
      </div>
    </div>
  );
}
