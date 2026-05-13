'use client';

// BottomPanels.tsx — bottom tab bar for the swap page
//
// Tabs: Global Trades | Open Orders | Positions | My Activity
//
// ## Open Orders (2026-04-01 wired)
//   useUserOrders() polls opcode 25 (GetUserOrders) on the Carbine controller.
//   Previously this was hardcoded to openOrderCount=0 (TODO placeholder).
//   Now: real order count from the on-chain state, rendered as badge + table.
//
//   Each order is 5 × u128 LE (80 bytes): orderId, side, price, amount, filled.
//   Price and amount are raw u128 in 1e8 units — divide by 1e8 for display.
//   side: 0 = buy (green), 1 = sell (red).
//
//   Cancel flow: useCancelOrderMutation (opcode 21). Token refund is via
//   carbine NFT redemption (separate tx) — NOT returned directly by cancel.
//   Cancel button is rendered per order row. On devnet, mines 1 block after
//   broadcast to keep metashrew synced (same pattern as useLimitOrderMutation).
//
// Source: hooks/useUserOrders.ts, hooks/useCancelOrderMutation.ts

import { useState, lazy, Suspense } from 'react';
import { BarChart3, Layers, Globe, Activity, X, LogOut, Plus } from 'lucide-react';
import { useLPPositions } from '@/hooks/useLPPositions';
import { useWallet } from '@/context/WalletContext';
import { useUserOrders } from '@/hooks/useUserOrders';
import { useCancelOrderMutation } from '@/hooks/useCancelOrderMutation';
import { useDevnet } from '@/context/DevnetContext';
import { getConfig } from '@/utils/getConfig';
import { useTranslation } from '@/hooks/useTranslation';
import TokenIcon from '@/app/components/TokenIcon';
import type { LPPosition } from './LiquidityInputs';

const RecentTradesPanel = lazy(() => import('./RecentTradesPanel'));
const MyWalletSwaps = lazy(() => import('./MyWalletSwaps'));

type PanelTab = 'orders' | 'positions' | 'trades' | 'activity';

interface Props {
  baseToken: string;
  quoteToken: string;
  baseTokenId?: string;
  quoteTokenId?: string;
  poolId?: string;
  isWrapPair?: boolean;
  hideOpenOrders?: boolean;
  onAddLiquidity?: (pair: {
    token0Id?: string;
    token0Symbol: string;
    token1Id?: string;
    token1Symbol: string;
  }) => void;
  onRemoveLiquidity?: (position: LPPosition) => void;
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-[color:var(--sf-text)]/20">
      <Icon className="h-6 w-6 mb-2" />
      <span className="text-xs">{message}</span>
    </div>
  );
}

export default function BottomPanels({
  baseToken,
  quoteToken,
  baseTokenId,
  quoteTokenId,
  poolId,
  isWrapPair,
  hideOpenOrders = false,
  onAddLiquidity,
  onRemoveLiquidity,
}: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PanelTab>('trades');
  const visibleActiveTab = hideOpenOrders && activeTab === 'orders' ? 'trades' : activeTab;
  const { isConnected, network } = useWallet() as any;
  const { positions: allPositions, isLoading: isLoadingPositions } = useLPPositions();
  const { controls: devnetControls } = useDevnet();

  // Filter to only real LP pool tokens — exclude staked positions (POS-*) on the swap page.
  // Real LP positions have token0Id/token1Id set from pool data match.
  const lpPositions = allPositions.filter(pos => pos.token0Id && pos.token1Id);

  // Open orders: poll Carbine controller opcode 25 (GetUserOrders) for this wallet.
  // Enabled only when a wallet is connected — avoids unnecessary RPC calls.
  // useUserOrders returns [] when controller is not deployed (safe default).
  const { data: userOrders = [], isLoading: isLoadingOrders } = useUserOrders(isConnected && !hideOpenOrders);

  // Cancel order mutation — opcode 21 (CancelOrder) on the Carbine controller.
  // On devnet, mines 1 block after broadcast to keep metashrew synced.
  const cancelMutation = useCancelOrderMutation();

  const config = getConfig(network || 'mainnet');
  const controllerId = (config as any).CARBINE_CONTROLLER_ID as string | undefined;

  const handleCancelOrder = async (orderId: number) => {
    if (!controllerId) return;
    try {
      await cancelMutation.mutateAsync({ controllerId, orderId, feeRate: 1 });
      // On devnet: mine 1 block so metashrew indexes the cancel tx before the
      // next useUserOrders refetch. Without this, the order still appears for ~5s.
      if (network === 'devnet') {
        try { await devnetControls.mineBlocks(1); } catch (_) {}
      }
    } catch (e) {
      console.error('[BottomPanels] Cancel order failed:', e);
    }
  };
  const openOrderCount = userOrders.length;

  const tabs: { key: PanelTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'trades', label: t('bottomPanels.globalTrades'), icon: <Globe size={12} /> },
    { key: 'activity', label: t('bottomPanels.myActivity'), icon: <Activity size={12} /> },
    { key: 'positions', label: t('bottomPanels.positions'), icon: <BarChart3 size={12} />, count: lpPositions.length },
    ...(!hideOpenOrders
      ? [{ key: 'orders' as const, label: t('bottomPanels.openOrders'), icon: <Layers size={12} />, count: openOrderCount }]
      : []),
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
              visibleActiveTab === tab.key
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
      <div className="min-h-[100px]">
        <Suspense fallback={<div className="p-6 text-center text-xs text-[color:var(--sf-text)]/20 animate-pulse">{t('common.loading')}</div>}>

          {/* Open Orders — powered by useUserOrders (Carbine opcode 25) */}
          {visibleActiveTab === 'orders' && (
            !isConnected ? (
              <EmptyState icon={Layers} message={t('bottomPanels.connectWalletOrders')} />
            ) : isLoadingOrders ? (
              <div className="p-6 text-center text-xs text-[color:var(--sf-text)]/20 animate-pulse">{t('bottomPanels.loadingOrders')}</div>
            ) : openOrderCount === 0 ? (
              <EmptyState icon={Layers} message={t('bottomPanels.noOpenOrders')} />
            ) : (
              <div>
                {/* Header */}
                <div className="sf-table-header grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 px-3 py-2">
                  <span>{t('bottomPanels.side')}</span>
                  <span className="text-right">{t('bottomPanels.price')}</span>
                  <span className="text-right">{t('bottomPanels.amount')}</span>
                  <span className="text-right">{t('bottomPanels.filled')}</span>
                  <span />
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                {userOrders.map((order) => {
                  // Raw u128 values are in 1e8 units — convert for display
                  const price  = (Number(order.price)  / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '.0');
                  const amount = (Number(order.amount) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '.0');
                  const filled = (Number(order.filled) / 1e8).toFixed(8).replace(/0+$/, '').replace(/\.$/, '.0');
                  const isSell = order.side === 1;
                  const isCancelling = cancelMutation.isPending && cancelMutation.variables?.orderId === order.orderId;
                  return (
                    <div
                      key={order.orderId}
                      className="sf-row grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 px-3 py-2 items-center"
                    >
                      {/* Side badge: green for BUY, red for SELL */}
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          isSell
                            ? 'bg-red-500/15 text-red-400'
                            : 'bg-green-500/15 text-green-400'
                        }`}
                      >
                        {isSell ? t('bottomPanels.sell') : t('bottomPanels.buy')}
                      </span>
                      <span className="text-[11px] text-right tabular-nums text-[color:var(--sf-text)]/80">
                        {price}
                      </span>
                      <span className="text-[11px] text-right tabular-nums text-[color:var(--sf-text)]/60">
                        {amount}
                      </span>
                      <span className="text-[11px] text-right tabular-nums text-[color:var(--sf-text)]/40">
                        {filled}
                      </span>
                      {/* Cancel button — triggers opcode 21 (CancelOrder) */}
                      <button
                        onClick={() => handleCancelOrder(order.orderId)}
                        disabled={isCancelling || cancelMutation.isPending}
                        title={t('bottomPanels.cancelOrder')}
                        className={`p-1 rounded hover:bg-red-500/20 transition-colors ${
                          isCancelling ? 'opacity-40 cursor-not-allowed' : 'text-[color:var(--sf-text)]/30 hover:text-red-400'
                        }`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
                </div>
              </div>
            )
          )}

          {/* LP Positions */}
          {visibleActiveTab === 'positions' && (
            !isConnected ? (
              <EmptyState icon={BarChart3} message={t('bottomPanels.connectWalletPositions')} />
            ) : isLoadingPositions ? (
              <div className="p-6 text-center text-xs text-[color:var(--sf-text)]/20 animate-pulse">{t('bottomPanels.loadingPositions')}</div>
            ) : lpPositions.length === 0 ? (
              <EmptyState icon={BarChart3} message={t('bottomPanels.noPositions')} />
            ) : (
              <div>
                {/* Header — column layout: Pool | Amount | Add | Close | ID */}
                <div className="sf-table-header grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.7fr] gap-2 px-3 py-2">
                  <span>{t('bottomPanels.pool')}</span>
                  <span className="text-right">{t('bottomPanels.amount')}</span>
                  <span className="text-center">{t('bottomPanels.add')}</span>
                  <span className="text-center">{t('bottomPanels.close')}</span>
                  <span className="text-right">{t('bottomPanels.id')}</span>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                {lpPositions.map((pos) => (
                  <div key={pos.id} className="sf-row grid grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_0.7fr] gap-2 px-3 py-2.5 items-center">
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
                    <span className="text-[11px] text-right tabular-nums text-[color:var(--sf-text)]/60 truncate">
                      {pos.amount || '--'}
                    </span>
                    <div className="flex justify-center">
                      <button
                        onClick={() => onAddLiquidity?.({
                          token0Id: pos.token0Id,
                          token0Symbol: pos.token0Symbol,
                          token1Id: pos.token1Id,
                          token1Symbol: pos.token1Symbol,
                        })}
                        disabled={!onAddLiquidity || !pos.token0Id || !pos.token1Id}
                        className="sf-btn-ghost text-[10px] px-2 py-1 text-green-400 hover:text-green-300 disabled:opacity-50"
                      >
                        <Plus size={10} className="inline mr-0.5" />{t('bottomPanels.add')}
                      </button>
                    </div>
                    <div className="flex justify-center">
                      <button
                        onClick={() => onRemoveLiquidity?.(pos)}
                        disabled={!onRemoveLiquidity}
                        className="sf-btn-ghost text-[10px] px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        <LogOut size={10} className="inline mr-0.5" />{t('bottomPanels.close')}
                      </button>
                    </div>
                    <span className="text-[10px] text-right tabular-nums text-[color:var(--sf-text)]/40 truncate">
                      {pos.id}
                    </span>
                  </div>
                ))}
                </div>
              </div>
            )
          )}

          {/* Trades */}
          {visibleActiveTab === 'trades' && (
            <RecentTradesPanel
              baseToken={baseTokenId || baseToken}
              quoteToken={quoteTokenId || quoteToken}
              poolId={poolId}
              isWrapPair={isWrapPair}
            />
          )}

          {/* Activity */}
          {visibleActiveTab === 'activity' && (
            <MyWalletSwaps />
          )}
        </Suspense>
      </div>
    </div>
  );
}
