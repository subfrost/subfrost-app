'use client';

import { useMemo, useState } from 'react';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePools } from '@/hooks/usePools';
import { usePendingTxs } from '@/hooks/usePendingTxs';
import { HelpCircle, RefreshCw, Send, QrCode, Settings } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

type BitcoinBalanceCardProps = {
  onSend?: () => void;
  onReceive?: () => void;
  onSettings?: () => void;
  settingsActive?: boolean;
};

export default function BitcoinBalanceCard({ onSend, onReceive, onSettings, settingsActive = false }: BitcoinBalanceCardProps) {
  const { data: btcPriceUsd = 0 } = useBtcPrice();
  const { t } = useTranslation();
  const { balances, btcFast, isBtcFastLoading, error, refreshBtcFast } = useEnrichedWalletData();
  const { data: poolsData } = usePools();
  const { btcDelta: pendingBtcDelta } = usePendingTxs();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      void refreshBtcFast().catch((err) => {
        console.warn('[BitcoinBalanceCard] refreshBtcFast failed:', err);
      });
      await new Promise(resolve => setTimeout(resolve, 700));
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBTC = (sats: number) => {
    return (sats / 100000000).toFixed(8);
  };

  const formatUSD = (sats: number) => {
    if (!btcPriceUsd) return null;
    const btc = sats / 100000000;
    return (btc * btcPriceUsd).toFixed(2);
  };

  const hasFast = btcFast && btcFast.total > 0;
  const hasEnriched = balances.bitcoin.total > 0;
  const isLoadingData = (!btcFast && isBtcFastLoading) || isRefreshing;

  let spendable: number;
  let pendingIn: number;

  if (hasFast) {
    spendable = btcFast.total;
    pendingIn = btcFast.pendingIn;
  } else if (hasEnriched) {
    spendable = balances.bitcoin.total;
    pendingIn = balances.bitcoin.pendingTotal;
  } else {
    spendable = 0;
    pendingIn = 0;
  }

  const totalBTC = formatBTC(spendable);
  const btcUsdValue = btcPriceUsd ? Number(formatUSD(spendable) ?? 0) : 0;
  const derivedPrices = useMemo(() => {
    const prices = new Map<string, number>();
    if (!btcPriceUsd || !poolsData?.items) return prices;
    prices.set('32:0', btcPriceUsd);
    for (const pool of poolsData.items) {
      const r0 = Number(pool.token0Amount || '0');
      const r1 = Number(pool.token1Amount || '0');
      if (r0 <= 0 || r1 <= 0) continue;
      const t0 = pool.token0.id;
      const t1 = pool.token1.id;
      if (prices.has(t1) && !prices.has(t0)) {
        prices.set(t0, (r1 / r0) * prices.get(t1)!);
      } else if (prices.has(t0) && !prices.has(t1)) {
        prices.set(t1, (r0 / r1) * prices.get(t0)!);
      }
    }
    return prices;
  }, [poolsData, btcPriceUsd]);
  const poolMap = useMemo(() => {
    const map = new Map<string, { token0Id: string; token1Id: string; token0Amount: string; token1Amount: string; lpTotalSupply: string }>();
    for (const pool of poolsData?.items ?? []) {
      map.set(pool.id, {
        token0Id: pool.token0.id,
        token1Id: pool.token1.id,
        token0Amount: pool.token0Amount || '0',
        token1Amount: pool.token1Amount || '0',
        lpTotalSupply: pool.lpTotalSupply || '0',
      });
    }
    return map;
  }, [poolsData]);
  const alkaneUsdValue = balances.alkanes.reduce((sum, alkane) => {
    try {
      if (BigInt(alkane.balance) === 1n) return sum;
    } catch {
      return sum;
    }
    const balanceFloat = Number(BigInt(alkane.balance)) / Math.pow(10, alkane.decimals || 8);
    if (!Number.isFinite(balanceFloat) || balanceFloat <= 0) return sum;
    if (alkane.priceUsd && alkane.priceUsd > 0) return sum + balanceFloat * alkane.priceUsd;
    if ((alkane.symbol === 'frBTC' || alkane.alkaneId === '32:0') && btcPriceUsd) {
      return sum + balanceFloat * btcPriceUsd;
    }
    if (alkane.priceInSatoshi && alkane.priceInSatoshi > 0 && btcPriceUsd) {
      return sum + balanceFloat * (alkane.priceInSatoshi / 1e8) * btcPriceUsd;
    }
    const derived = derivedPrices.get(alkane.alkaneId);
    if (derived && derived > 0) return sum + balanceFloat * derived;
    const pool = poolMap.get(alkane.alkaneId);
    if (pool) {
      const p0 = derivedPrices.get(pool.token0Id);
      const p1 = derivedPrices.get(pool.token1Id);
      const totalSupply = Number(pool.lpTotalSupply);
      if (p0 && p1 && totalSupply > 0) {
        const r0 = Number(pool.token0Amount) / 1e8;
        const r1 = Number(pool.token1Amount) / 1e8;
        return sum + (Number(BigInt(alkane.balance)) / totalSupply) * (r0 * p0 + r1 * p1);
      }
    }
    return sum;
  }, 0);
  const totalEstimatedUsd = btcUsdValue + alkaneUsdValue;
  const totalEstimatedBTC = btcPriceUsd && totalEstimatedUsd > 0
    ? (totalEstimatedUsd / btcPriceUsd).toFixed(8)
    : totalBTC;
  const totalUSD = btcPriceUsd
    ? totalEstimatedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  const showValue = (value: string) => {
    return isLoadingData ? (
      <span className="text-[color:var(--sf-text)]/60">{t('balances.loading')}</span>
    ) : value;
  };

  if (error) {
    return (
      <div className="h-full rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-red-400 mb-4">{error}</div>
          <button
            onClick={refreshBtcFast}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
          >
            {t('balances.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
      <img
        src="/brand/snowflake-mark.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 top-[58%] h-96 w-96 -translate-y-1/2 rotate-12 opacity-[0.2]"
      />
      <div className="relative z-30 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[color:var(--sf-text)]">
            {t('balances.estimatedTotalValue')}
            <span className="group relative inline-flex">
              <HelpCircle size={15} className="text-[color:var(--sf-text)]/50" aria-hidden="true" />
              <span className="pointer-events-none absolute left-1/2 top-full z-[100] mt-2 w-64 -translate-x-1/2 rounded-lg bg-[color:var(--sf-panel-opaque)] px-3 py-2 text-xs font-medium text-[color:var(--sf-text)] opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-opacity group-hover:opacity-100">
                {t('balances.estimatedTotalValueTooltip')}
              </span>
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isLoadingData}
            className="p-1.5 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50 shrink-0"
            title="Refresh balances"
          >
            <RefreshCw size={16} className={isLoadingData ? 'animate-spin' : ''} />
          </button>
          {onSettings && (
            <button
              onClick={onSettings}
              className={`p-1.5 rounded-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shrink-0 ${
                settingsActive
                  ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                  : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 hover:bg-[color:var(--sf-primary)]/10'
              }`}
              title={t('header.settings')}
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-2 text-xl font-bold text-[color:var(--sf-text)]">
          <img src="/tokens/btc-white.svg" alt="" className="h-9 w-9 shrink-0" aria-hidden="true" />
          <span className="font-bold">{showValue(`${totalEstimatedBTC} BTC`)}</span>
        </div>
        <div className="text-sm text-[color:var(--sf-text)]/60 mt-1">
          {isLoadingData ? (
            <span>{t('balances.loading')}</span>
          ) : (
            `≈ $${totalUSD || '0.00'} USD`
          )}
        </div>
        {!isLoadingData && pendingIn > 0 && (
          <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">
            +{formatBTC(pendingIn)} BTC pending
          </div>
        )}
        {pendingBtcDelta !== 0n && (() => {
          const sats = Number(pendingBtcDelta);
          const sign = sats < 0 ? '-' : '+';
          const abs = Math.abs(sats);
          return (
            <div
              className="text-xs text-amber-300/80 mt-1"
              title="Pending mempool delta from your recent broadcasts - overlays confirmed balance until block-tip"
            >
              {sign}{formatBTC(abs)} BTC pending
            </div>
          );
        })()}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {onSend && (
            <button
              data-testid="bitcoin-card-send-button"
              onClick={onSend}
              className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-primary)] text-white text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
            >
              <Send size={16} />
              {t('walletDash.send')}
            </button>
          )}
          {onReceive && (
            <button
              onClick={onReceive}
              className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-panel-opaque)] text-[color:var(--sf-text)] text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
            >
              <QrCode size={16} />
              {t('walletDash.receive')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
