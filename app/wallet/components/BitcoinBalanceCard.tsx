'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function BitcoinBalanceCard() {
  const { account } = useWallet() as any;
  const { bitcoinPrice } = useAlkanesSDK();
  const { t } = useTranslation();
  const { balances, isLoading, error, refresh } = useEnrichedWalletData();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        new Promise(resolve => setTimeout(resolve, 500))
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatBTC = (sats: number) => {
    return (sats / 100000000).toFixed(8);
  };

  const formatUSD = (sats: number) => {
    if (!bitcoinPrice) return null;
    const btc = sats / 100000000;
    return (btc * bitcoinPrice.usd).toFixed(2);
  };

  const isLoadingData = isLoading || isRefreshing;
  const showValue = (value: string) => {
    return isLoadingData ? (
      <span className="text-[color:var(--sf-text)]/60">{t('balances.loading')}</span>
    ) : value;
  };

  if (error) {
    return (
      <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-red-400 mb-4">{error}</div>
          <button
            onClick={refresh}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
          >
            {t('balances.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  // Show spendable balance (excludes UTXOs carrying inscriptions/runes/alkanes)
  // This matches what wallet extensions like Xverse/OKX display
  const spendableConfirmed = balances.bitcoin.spendable + balances.bitcoin.pendingOutgoingTotal;
  const lockedInAssets = balances.bitcoin.withAssets;
  const pendingDiff = balances.bitcoin.pendingTotal - balances.bitcoin.pendingOutgoingTotal;
  const totalBTC = formatBTC(spendableConfirmed);
  const totalUSD = bitcoinPrice ? formatUSD(spendableConfirmed) : null;

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-500/20 border border-orange-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="currentColor" viewBox="0 0 256 256" className="text-orange-400"><path d="M178.48,115.7A44,44,0,0,0,152,40.19V24a8,8,0,0,0-16,0V40H120V24a8,8,0,0,0-16,0V40H72a8,8,0,0,0,0,16h8V192H72a8,8,0,0,0,0,16h32v16a8,8,0,0,0,16,0V208h16v16a8,8,0,0,0,16,0V208h8a48,48,0,0,0,18.48-92.3ZM176,84a28,28,0,0,1-28,28H96V56h52A28,28,0,0,1,176,84ZM160,192H96V128h64a32,32,0,0,1,0,64Z"></path></svg>
          </div>
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

      {/* Total Balance (confirmed only) */}
      <div className="mb-4">
        <div className="text-xl font-bold text-[color:var(--sf-text)]">{showValue(`${totalBTC} BTC`)}</div>
        <div className="text-sm text-[color:var(--sf-text)]/60 mt-1">
          {isLoadingData ? (
            <span>{t('balances.loading')}</span>
          ) : (
            `$${totalUSD || '0.00'} USD`
          )}
        </div>
        {!isLoadingData && pendingDiff !== 0 && (
          <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">
            {pendingDiff > 0 ? '+' : ''}{formatBTC(pendingDiff)} BTC pending
          </div>
        )}
        {!isLoadingData && lockedInAssets > 0 && (
          <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">
            {formatBTC(lockedInAssets)} BTC locked in assets
          </div>
        )}
      </div>

      {/* Address Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-[color:var(--sf-outline)]">
        <a
          href={account?.nativeSegwit?.address ? `https://mempool.space/address/${account.nativeSegwit.address}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3 hover:brightness-110 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center justify-between"
        >
          <div>
            <div className="text-xs text-[color:var(--sf-info-green-title)] mb-1">Native SegWit (Spendable)</div>
            <div className="text-sm text-[color:var(--sf-info-green-text)]">
              {showValue(`${formatBTC(balances.bitcoin.p2wpkh + balances.bitcoin.pendingOutgoingP2wpkh)} BTC`)}
            </div>
            {!isLoadingData && (balances.bitcoin.pendingP2wpkh - balances.bitcoin.pendingOutgoingP2wpkh) !== 0 && (
              <div className="text-[10px] text-[color:var(--sf-info-green-text)]/50 mt-0.5">
                {(balances.bitcoin.pendingP2wpkh - balances.bitcoin.pendingOutgoingP2wpkh) > 0 ? '+' : ''}{formatBTC(balances.bitcoin.pendingP2wpkh - balances.bitcoin.pendingOutgoingP2wpkh)} pending
              </div>
            )}
          </div>
          <ExternalLink size={12} className="text-[color:var(--sf-info-green-text)]/60 shrink-0" />
        </a>
        <a
          href={account?.taproot?.address ? `https://mempool.space/address/${account.taproot.address}` : '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3 hover:brightness-110 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center justify-between"
        >
          <div>
            <div className="text-xs text-[color:var(--sf-info-yellow-title)] mb-1">{t('balances.taproot')}</div>
            <div className="text-sm text-[color:var(--sf-info-yellow-text)]">
              {showValue(`${formatBTC(balances.bitcoin.p2tr + balances.bitcoin.pendingOutgoingP2tr)} BTC`)}
            </div>
            {!isLoadingData && (balances.bitcoin.pendingP2tr - balances.bitcoin.pendingOutgoingP2tr) !== 0 && (
              <div className="text-[10px] text-[color:var(--sf-info-yellow-text)]/50 mt-0.5">
                {(balances.bitcoin.pendingP2tr - balances.bitcoin.pendingOutgoingP2tr) > 0 ? '+' : ''}{formatBTC(balances.bitcoin.pendingP2tr - balances.bitcoin.pendingOutgoingP2tr)} pending
              </div>
            )}
          </div>
          <ExternalLink size={12} className="text-[color:var(--sf-info-yellow-text)]/60 shrink-0" />
        </a>
      </div>
    </div>
  );
}
