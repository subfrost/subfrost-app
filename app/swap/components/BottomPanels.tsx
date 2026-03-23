'use client';

import { useState, lazy, Suspense } from 'react';
import { BarChart3, Layers, Clock, Activity, ExternalLink } from 'lucide-react';
import { useLPPositions } from '@/hooks/useLPPositions';
import { useOrderbook } from '@/hooks/useOrderbook';
import { useWallet } from '@/context/WalletContext';
import TokenIcon from '@/app/components/TokenIcon';

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
  const { isConnected, network } = useWallet() as any;
  const { positions: allPositions, isLoading: isLoadingPositions } = useLPPositions();

  // Filter to only real LP pool tokens — exclude staked positions (POS-*) on the swap page.
  // Real LP positions have token0Id/token1Id set from pool data match.
  const lpPositions = allPositions.filter(pos => pos.token0Id && pos.token1Id);

  // Open orders count: zero until carbine controller is deployed on-chain
  const openOrderCount = 0;

  const tabs: { key: PanelTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'trades', label: 'Global Trades', icon: <Clock size={12} /> },
    { key: 'orders', label: 'Open Orders', icon: <Layers size={12} />, count: openOrderCount },
    { key: 'positions', label: 'Positions', icon: <BarChart3 size={12} />, count: lpPositions.length },
    { key: 'activity', label: 'My Activity', icon: <Activity size={12} /> },
  ];

  return (
    <div className="sf-card overflow-hidden">
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
              <div>
                {/* Header */}
                <div className="sf-table-header grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2">
                  <span>Pool</span>
                  <span className="text-right">Amount</span>
                  <span className="text-right w-[72px]">ID</span>
                </div>
                {lpPositions.map((pos) => (
                  <div key={pos.id} className="sf-row grid grid-cols-[1fr_auto_auto] gap-4 px-3 py-2.5 items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex -space-x-2 shrink-0">
                        <div className="relative z-10">
                          <TokenIcon symbol={pos.token0Symbol} id={pos.token0Id} size="sm" network={network} />
                        </div>
                        <div className="relative">
                          <TokenIcon symbol={pos.token1Symbol} id={pos.token1Id} size="sm" network={network} />
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-[color:var(--sf-text)]/80 truncate">
                        {pos.token0Symbol}/{pos.token1Symbol} LP
                      </span>
                    </div>
                    <span className="text-[11px] text-right tabular-nums text-[color:var(--sf-text)]/60">
                      {pos.amount || '--'}
                    </span>
                    <span className="text-[10px] text-right tabular-nums text-[color:var(--sf-text)]/40 w-[72px] truncate">
                      {pos.id}
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
