'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { Bitcoin, Coins, RefreshCw, ExternalLink, Flame, Lock } from 'lucide-react';
import TokenIcon from '@/app/components/TokenIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { useFuelAllocation } from '@/hooks/useFuelAllocation';

export default function BalancesPanel() {
  const { account } = useWallet() as any;
  const { bitcoinPrice } = useAlkanesSDK();
  const { t } = useTranslation();
  const { balances, isLoading, error, refresh } = useEnrichedWalletData();
  const fuelAllocation = useFuelAllocation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [alkaneFilter, setAlkaneFilter] = useState<'tokens' | 'nfts' | 'positions'>('tokens');
  const [inscriptionFilter, setInscriptionFilter] = useState<'brc20' | 'ordinals'>('brc20');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refresh(),
        new Promise(resolve => setTimeout(resolve, 500)) // minimum 500ms spin
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

  // Classify an alkane as LP position, staked position, NFT, or regular token
  const isLpToken = (alkane: { symbol: string; name: string }) =>
    /\bLP\b/i.test(alkane.symbol) || /\bLP\b/i.test(alkane.name);
  const isStakedPosition = (alkane: { symbol: string; name: string }) =>
    alkane.symbol.startsWith('POS-') || alkane.name.startsWith('POS-');
  const isPosition = (alkane: { symbol: string; name: string }) =>
    isLpToken(alkane) || isStakedPosition(alkane);
  const isNft = (balance: string) => BigInt(balance) === BigInt(1);

  const formatAlkaneBalance = (balance: string, decimals: number = 8, alkane?: { symbol: string; name: string }): string => {
    const value = BigInt(balance);

    // Exactly 1 raw unit: show contextual label
    if (value === BigInt(1)) {
      if (alkane && isStakedPosition(alkane)) return '1 Position';
      if (alkane && isLpToken(alkane)) return '1 Position';
      return '1 NFT';
    }

    const divisor = BigInt(10 ** decimals);
    const whole = value / divisor;
    const remainder = value % divisor;
    const wholeStr = whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, '0');

    // frBTC: always show full 8 decimal places
    const isFrbtc = alkane && (alkane.symbol === 'frBTC' || alkane.name === 'frBTC');
    if (isFrbtc) {
      return `${wholeStr}.${remainderStr.slice(0, 8)}`;
    }

    // 10,000+ units: no decimals
    if (whole >= BigInt(10000)) {
      return wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // 100-9,999: 2 decimal places
    // Under 100: 4 decimal places
    const decimalPlaces = wholeStr.length >= 3 ? 2 : 4;
    const truncatedRemainder = remainderStr.slice(0, decimalPlaces);

    return `${wholeStr}.${truncatedRemainder}`;
  };

  // Helper to show loading or value during initial load or refresh
  const isLoadingData = isLoading || isRefreshing;
  const showValue = (value: string) => {
    return isLoadingData ? (
      <span className="text-[color:var(--sf-text)]/60">{t('balances.loading')}</span>
    ) : value;
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={refresh}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
        >
          {t('balances.tryAgain')}
        </button>
      </div>
    );
  }

  const totalBTC = formatBTC(balances.bitcoin.total);
  const totalUSD = bitcoinPrice ? formatUSD(balances.bitcoin.total) : null;

  return (
    <div className="space-y-6">
      {/* Bitcoin Balance */}
      <div className="rounded-xl bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-6">
        <div className="flex items-center justify-between mb-6 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-3 rounded-xl bg-orange-500/20 border border-orange-500/30 shrink-0">
              <Bitcoin size={24} className="text-orange-400 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <div className="text-sm text-[color:var(--sf-text)]/60 mb-1">{t('balances.bitcoinBalance')}</div>
              <div className="text-lg sm:text-2xl md:text-3xl font-bold text-[color:var(--sf-text)] break-words">{showValue(`${totalBTC} BTC`)}</div>
              <div className="text-sm text-[color:var(--sf-text)]/60 mt-1">
                {isLoadingData ? (
                  <span>{t('balances.loading')}</span>
                ) : (
                  `$${totalUSD || '0.00'} USD`
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoadingData}
            className="p-1.5 sm:p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50 shrink-0"
            title="Refresh balances"
          >
            <RefreshCw size={18} className={`${isLoadingData ? 'animate-spin' : ''} sm:w-5 sm:h-5`} />
          </button>
        </div>

        {/* Balance Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-[color:var(--sf-outline)]">
          <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
            <div className="text-xs text-[color:var(--sf-info-green-title)] mb-1">{t('balances.spendableBtc')}</div>
            <div className="text-sm text-[color:var(--sf-info-green-text)]">
              {showValue(`${formatBTC(balances.bitcoin.spendable)} BTC ${!isLoadingData && formatUSD(balances.bitcoin.spendable) ? `($${formatUSD(balances.bitcoin.spendable)})` : ''}`)}
            </div>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
            <div className="text-xs text-[color:var(--sf-info-yellow-title)] mb-1">{t('balances.unspendable')}</div>
            <div className="text-sm text-[color:var(--sf-info-yellow-text)]">
              {showValue(`${formatBTC(balances.bitcoin.withAssets)} BTC ${!isLoadingData && formatUSD(balances.bitcoin.withAssets) ? `($${formatUSD(balances.bitcoin.withAssets)})` : ''}`)}
            </div>
          </div>
        </div>

        {/* Address Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[color:var(--sf-outline)] mt-4">
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('balances.nativeSegwit')}</div>
            <div className="text-sm text-[color:var(--sf-text)]">
              {showValue(`${formatBTC(balances.bitcoin.p2wpkh)} BTC`)}
            </div>
            <a
              href={account?.nativeSegwit?.address ? `https://mempool.space/address/${account.nativeSegwit.address}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--sf-text)]/40 mt-1 hover:text-[#5b9cff] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center gap-1"
              title={account?.nativeSegwit?.address ? `View ${account.nativeSegwit.address} on mempool.space` : 'No address'}
            >
              <span className="truncate">{account?.nativeSegwit?.address ? `${account.nativeSegwit.address.slice(0, 6)}...${account.nativeSegwit.address.slice(-4)}` : 'Not Found'}</span>
              <ExternalLink size={10} className="shrink-0" />
            </a>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('balances.taproot')}</div>
            <div className="text-sm text-[color:var(--sf-text)]">
              {showValue(`${formatBTC(balances.bitcoin.p2tr)} BTC`)}
            </div>
            <a
              href={account?.taproot?.address ? `https://mempool.space/address/${account.taproot.address}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--sf-text)]/40 mt-1 hover:text-[#5b9cff] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center gap-1"
              title={account?.taproot?.address ? `View ${account.taproot.address} on mempool.space` : 'No address'}
            >
              <span className="truncate">{account?.taproot?.address ? `${account.taproot.address.slice(0, 6)}...${account.taproot.address.slice(-4)}` : 'Not Found'}</span>
              <ExternalLink size={10} className="shrink-0" />
            </a>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-3">
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('balances.pendingTx')}</div>
            <div className="text-sm text-[color:var(--sf-text)] flex items-center gap-1">
              <a
                href={account?.nativeSegwit?.address ? `https://mempool.space/address/${account.nativeSegwit.address}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#5b9cff] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                title={account?.nativeSegwit?.address ? `View ${account.nativeSegwit.address} on mempool.space` : 'No address'}
              >
                +{balances.pendingTxCount.p2wpkh}
              </a>
              <span className="text-[color:var(--sf-text)]/40">/</span>
              <a
                href={account?.taproot?.address ? `https://mempool.space/address/${account.taproot.address}` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#5b9cff] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                title={account?.taproot?.address ? `View ${account.taproot.address} on mempool.space` : 'No address'}
              >
                +{balances.pendingTxCount.p2tr}
              </a>
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">bc1q / bc1p</div>
          </div>
        </div>
      </div>

      {/* FUEL Allocation - only visible to wallets on the allocation list */}
      {fuelAllocation.isEligible && (
        <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-600/5 p-6 border border-amber-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30">
                <Flame size={28} className="text-amber-400" />
              </div>
              <div>
                <div className="text-sm text-[color:var(--sf-text)]/60 mb-1">{t('balances.fuelAllocation')}</div>
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[color:var(--sf-text)]">
                  {fuelAllocation.amount.toLocaleString()} FUEL
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-amber-500/20">
            <p className="text-xs text-[color:var(--sf-text)]/60 leading-relaxed">
              {t('balances.fuelNote')}
            </p>
          </div>
        </div>
      )}

      {/* Token Assets - 60/40 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        {/* Alkanes Balances */}
        <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6 flex flex-col" style={{ maxHeight: '540px' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Coins size={24} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('balances.protoruneAssets')}</h3>
          </div>

          {/* Tokens / NFTs / Positions tabs */}
          <div className="flex gap-4 mb-4">
            {(['tokens', 'nfts', 'positions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setAlkaneFilter(tab)}
                className={`pb-3 px-1 text-sm font-semibold ${
                  alkaneFilter === tab
                    ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                    : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
                }`}
              >
                {tab === 'tokens' ? t('balances.tabTokens') : tab === 'nfts' ? t('balances.tabNfts') : t('balances.tabPositions')}
              </button>
            ))}
          </div>

          {(() => {
            const filtered = balances.alkanes.filter((a) => {
              if (alkaneFilter === 'positions') return isPosition(a);
              if (alkaneFilter === 'nfts') return isNft(a.balance) && !isPosition(a);
              // tokens: not an NFT and not a position
              return !isNft(a.balance) && !isPosition(a);
            });

            const emptyLabels: Record<string, { title: string; hint: string }> = {
              tokens: { title: t('balances.noProtorune'), hint: t('balances.protoruneHint') },
              nfts: { title: t('balances.noNfts'), hint: t('balances.nftsHint') },
              positions: { title: t('balances.noPositions'), hint: t('balances.positionsHint') },
            };

            return filtered.length > 0 ? (
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {filtered.map((alkane) => (
                  <div
                    key={alkane.alkaneId}
                    className="flex items-center justify-between p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                  >
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={alkane.symbol} id={alkane.alkaneId} size="lg" />
                      <div>
                        <div className="font-medium text-[color:var(--sf-text)]">{alkane.name}</div>
                        <div className="text-xs text-[color:var(--sf-text)]/40">{alkane.symbol} · {alkane.alkaneId}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[color:var(--sf-text)]">
                        {showValue(formatAlkaneBalance(alkane.balance, alkane.decimals, alkane))}
                      </div>
                      {!isLoadingData && <div className="text-xs text-[color:var(--sf-text)]/60">$X.XX</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-[color:var(--sf-text)]/60">
                {isLoadingData ? (
                  <span>{t('balances.loading')}</span>
                ) : (
                  <>
                    {emptyLabels[alkaneFilter].title}
                    <div className="text-xs text-[color:var(--sf-text)]/40 mt-2">
                      {emptyLabels[alkaneFilter].hint}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </div>

        {/* Inscription Balances */}
        <div className="rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-6 flex flex-col" style={{ maxHeight: '540px' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
              <Coins size={24} className="text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('balances.inscriptionAssets')}</h3>
          </div>

          {/* BRC20 Tokens / Ordinals tabs */}
          <div className="flex gap-4 mb-4">
            {(['brc20', 'ordinals'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setInscriptionFilter(tab)}
                className={`pb-3 px-1 text-sm font-semibold ${
                  inscriptionFilter === tab
                    ? 'text-[color:var(--sf-primary)] border-b-2 border-[color:var(--sf-primary)]'
                    : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
                }`}
              >
                {tab === 'brc20' ? t('balances.tabBrc20') : t('balances.tabOrdinals')}
              </button>
            ))}
          </div>

          <div className="text-center py-8 text-[color:var(--sf-text)]/60">
            <span className="text-lg font-medium">{t('balances.comingSoon')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
