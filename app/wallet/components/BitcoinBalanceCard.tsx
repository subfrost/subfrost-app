'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePendingTxs } from '@/hooks/usePendingTxs';
import { RefreshCw, ExternalLink, Send, QrCode } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

type BitcoinBalanceCardProps = {
  onSend?: () => void;
  onReceive?: () => void;
};

export default function BitcoinBalanceCard({ onSend, onReceive }: BitcoinBalanceCardProps) {
  const { account } = useWallet() as any;
  // Single source of truth for BTC price — see queries/market.ts (subpricer
  // primary, rpc.ts + coingecko fallbacks). Returns 0 when no source resolves.
  const { data: btcPriceUsd = 0 } = useBtcPrice();
  const { t } = useTranslation();
  const { balances, btcFast, isBtcFastLoading, isBtcLoading, error, refreshBtcFast } = useEnrichedWalletData();
  const { btcDelta: pendingBtcDelta } = usePendingTxs();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshBtcFast(),
        new Promise(resolve => setTimeout(resolve, 300))
      ]);
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

  // btcFast: wallet API (instant) or esplora. Fallback to enriched lua data.
  const hasFast = btcFast && btcFast.total > 0;
  const hasEnriched = balances.bitcoin.total > 0;
  // No data from either source = still loading (even if individual isLoading is false)
  const isLoadingData = (!hasFast && !hasEnriched) || isRefreshing;

  const isDualAddress = !!account?.nativeSegwit?.address && !!account?.taproot?.address;

  let spendable: number;
  let p2wpkh: number;
  let p2tr: number;
  let pendingIn: number;

  if (hasFast) {
    // Wallet API / esplora — spendable balance
    p2wpkh = btcFast.p2wpkh;
    p2tr = btcFast.p2tr;
    spendable = isDualAddress ? p2wpkh : btcFast.total;
    pendingIn = btcFast.pendingIn;
  } else if (hasEnriched) {
    // Lua enriched — fallback
    p2wpkh = balances.bitcoin.p2wpkh;
    p2tr = balances.bitcoin.p2tr;
    spendable = isDualAddress ? p2wpkh : balances.bitcoin.total;
    pendingIn = balances.bitcoin.pendingTotal;
  } else {
    p2wpkh = 0;
    p2tr = 0;
    spendable = 0;
    pendingIn = 0;
  }

  const totalBTC = formatBTC(spendable);
  const totalUSD = btcPriceUsd ? formatUSD(spendable) : null;

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
    <div className="h-full rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <img src="/tokens/btc-white.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
          <h3 className="text-lg font-bold text-[color:var(--sf-text)]">{t('balances.bitcoinBalance')}</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoadingData}
          className="p-1.5 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50 shrink-0"
          title="Refresh balances"
        >
          <RefreshCw size={16} className={isLoadingData ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Spendable Balance */}
      <div className="mb-4">
        <div className="text-xl font-bold text-[color:var(--sf-text)]">{showValue(`${totalBTC} BTC`)}</div>
        <div className="text-sm text-[color:var(--sf-text)]/60 mt-1">
          {isLoadingData ? (
            <span>{t('balances.loading')}</span>
          ) : (
            `$${totalUSD || '0.00'} USD`
          )}
        </div>
        {!isLoadingData && pendingIn > 0 && (
          <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">
            +{formatBTC(pendingIn)} BTC pending
          </div>
        )}
        {pendingBtcDelta !== 0n && (() => {
          // Signed pending overlay from broadcast txs we've made (the
          // pending-tx store is a superset of indexer-reported pending
          // because indexers can lag broadcast). For outgoing txs this
          // is negative (we lost sats); for incoming-only this is
          // positive. Distinct from `pendingIn` above which is the
          // address-level mempool API.
          const sats = Number(pendingBtcDelta);
          const sign = sats < 0 ? '−' : '+';
          const abs = Math.abs(sats);
          return (
            <div
              className="text-xs text-amber-300/80 mt-1"
              title="Pending mempool delta from your recent broadcasts — overlays confirmed balance until block-tip"
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
              className="px-4 md:px-6 py-2 rounded-md bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)] text-sm font-bold uppercase tracking-wide shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:bg-[color:var(--sf-surface)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center gap-2"
            >
              <QrCode size={16} />
              {t('walletDash.receive')}
            </button>
          )}
        </div>
      </div>

      {/* Address Breakdown — only show when wallet has both address types */}
      {isDualAddress && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-[color:var(--sf-outline)]">
        {account?.nativeSegwit?.address && (
          <a
            href={`https://mempool.space/address/${account.nativeSegwit.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[color-mix(in_oklab,var(--sf-primary)_5%,transparent)] p-3 hover:brightness-110 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center justify-between"
          >
            <div>
              <div className="text-xs text-[color:var(--sf-info-green-title)] mb-1">Native SegWit</div>
              <div className="text-sm text-white">
                {showValue(`${formatBTC(p2wpkh)} BTC`)}
              </div>
            </div>
            <ExternalLink size={16} className="text-white/70 shrink-0" />
          </a>
        )}
        {account?.taproot?.address && (
          <a
            href={`https://mempool.space/address/${account.taproot.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-[color-mix(in_oklab,var(--sf-primary)_5%,transparent)] p-3 hover:brightness-110 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center justify-between"
          >
            <div>
              <div className="text-xs text-[color:var(--sf-info-yellow-title)] mb-1">{t('balances.taproot')}</div>
              <div className="text-sm text-white">
                {showValue(`${formatBTC(p2tr)} BTC`)}
              </div>
            </div>
            <ExternalLink size={16} className="text-white/70 shrink-0" />
          </a>
        )}
      </div>
      )}
    </div>
  );
}
