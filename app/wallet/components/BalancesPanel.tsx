'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePools } from '@/hooks/usePools';
import { Bitcoin, Coins, RefreshCw, ExternalLink, Flame, Lock, Send, ArrowLeftRight, ArrowUpFromLine } from 'lucide-react';
import TokenIcon from '@/app/components/TokenIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { useFuelAllocation } from '@/hooks/useFuelAllocation';
import { usePositionMetadata, isEnrichablePosition } from '@/hooks/usePositionMetadata';

import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';
import type { PositionMeta } from '@/hooks/usePositionMetadata';

const FRBTC_ID = '32:0';

interface BalancesPanelProps {
  onSendAlkane?: (alkane: AlkaneAsset) => void;
}

export default function BalancesPanel({ onSendAlkane }: BalancesPanelProps = {}) {
  const { account, network } = useWallet() as any;
  const { bitcoinPrice } = useAlkanesSDK();
  const { t } = useTranslation();
  const { balances, isLoading, error, refresh } = useEnrichedWalletData();
  const { data: poolsData } = usePools();
  const fuelAllocation = useFuelAllocation();
  const { data: positionMeta } = usePositionMetadata(balances.alkanes);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedAlkaneId, setExpandedAlkaneId] = useState<string | null>(null);
  const [alkaneFilter, setAlkaneFilter] = useState<'tokens' | 'nfts' | 'positions'>('tokens');
  const [inscriptionFilter, setInscriptionFilter] = useState<'brc20' | 'ordinals'>('brc20');

  // Build pool map: poolId → pool data (for LP token identification + token pricing)
  const poolMap = useMemo(() => {
    const map = new Map<string, { token0Symbol: string; token1Symbol: string; token0Id: string; token1Id: string; token0Amount: string; token1Amount: string; lpTotalSupply: string }>();
    if (poolsData?.items) {
      for (const pool of poolsData.items) {
        map.set(pool.id, {
          token0Symbol: pool.token0.symbol,
          token1Symbol: pool.token1.symbol,
          token0Id: pool.token0.id,
          token1Id: pool.token1.id,
          token0Amount: pool.token0Amount || '0',
          token1Amount: pool.token1Amount || '0',
          lpTotalSupply: pool.lpTotalSupply || '0',
        });
      }
    }
    return map;
  }, [poolsData]);

  // Derive token prices from pool reserves: tokenId → priceUsd
  const derivedPrices = useMemo(() => {
    const prices = new Map<string, number>();
    if (!bitcoinPrice?.usd || !poolsData?.items) return prices;
    // frBTC is always 1:1 with BTC
    prices.set(FRBTC_ID, bitcoinPrice.usd);
    for (const pool of poolsData.items) {
      const r0 = Number(pool.token0Amount || '0');
      const r1 = Number(pool.token1Amount || '0');
      if (r0 <= 0 || r1 <= 0) continue;
      const t0 = pool.token0.id;
      const t1 = pool.token1.id;
      // If one side's price is known, derive the other
      if (prices.has(t1) && !prices.has(t0)) {
        // price(t0) = (r1/r0) * price(t1)
        prices.set(t0, (r1 / r0) * prices.get(t1)!);
      } else if (prices.has(t0) && !prices.has(t1)) {
        prices.set(t1, (r0 / r1) * prices.get(t0)!);
      }
    }
    return prices;
  }, [poolsData, bitcoinPrice]);

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
  const isLpToken = (alkane: { symbol: string; name: string; alkaneId?: string }) =>
    /\bLP\b/i.test(alkane.symbol) || /\bLP\b/i.test(alkane.name) || (alkane.alkaneId ? poolMap.has(alkane.alkaneId) : false);
  const isStakedPosition = (alkane: { symbol: string; name: string }) =>
    alkane.symbol.startsWith('POS-') || alkane.name.startsWith('POS-');
  const isPosition = (alkane: { symbol: string; name: string; alkaneId?: string }) =>
    isLpToken(alkane) || isStakedPosition(alkane);
  const isNft = (balance: string) => BigInt(balance) === BigInt(1);

  const formatDepositAmount = (amount: string, decimals: number, symbol: string): string => {
    const val = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const whole = val / divisor;
    const remainder = val % divisor;
    const wholeStr = whole.toString();
    const remainderStr = remainder.toString().padStart(decimals, '0');
    let formatted: string;
    if (whole >= BigInt(10000)) {
      formatted = wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    } else {
      const dp = wholeStr.length >= 3 ? 2 : 4;
      formatted = `${wholeStr}.${remainderStr.slice(0, dp)}`;
    }
    return symbol ? `${formatted} ${symbol}` : formatted;
  };

  const formatAlkaneBalance = (balance: string, decimals: number = 8, alkane?: { symbol: string; name: string; alkaneId?: string }): string => {
    const value = BigInt(balance);

    // Exactly 1 raw unit: show contextual label
    if (value === BigInt(1)) {
      // For enrichable positions, show the deposit amount instead of "1 Position"
      if (alkane && alkane.alkaneId && isEnrichablePosition(alkane) && positionMeta?.[alkane.alkaneId]) {
        const meta = positionMeta[alkane.alkaneId];
        return formatDepositAmount(meta.depositAmount, meta.depositTokenDecimals, meta.depositTokenSymbol);
      }
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

        {/* Address Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[color:var(--sf-outline)]">
          <div className="rounded-lg bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] p-3">
            <div className="text-xs text-[color:var(--sf-info-green-title)] mb-1">Native SegWit (Spendable)</div>
            <div className="text-sm text-[color:var(--sf-info-green-text)]">
              {showValue(`${formatBTC(balances.bitcoin.p2wpkh)} BTC`)}
            </div>
            <a
              href={account?.nativeSegwit?.address ? `https://mempool.space/address/${account.nativeSegwit.address}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--sf-info-green-text)]/60 mt-1 hover:text-[#5b9cff] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center gap-1"
              title={account?.nativeSegwit?.address ? `View ${account.nativeSegwit.address} on mempool.space` : 'No address'}
            >
              <span className="truncate">{account?.nativeSegwit?.address ? `${account.nativeSegwit.address.slice(0, 4)}...${account.nativeSegwit.address.slice(-3)}` : 'Not Found'}</span>
              <ExternalLink size={10} className="shrink-0" />
            </a>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-info-yellow-bg)] border border-[color:var(--sf-info-yellow-border)] p-3">
            <div className="text-xs text-[color:var(--sf-info-yellow-title)] mb-1">{t('balances.taproot')}</div>
            <div className="text-sm text-[color:var(--sf-info-yellow-text)]">
              {showValue(`${formatBTC(balances.bitcoin.p2tr)} BTC`)}
            </div>
            <a
              href={account?.taproot?.address ? `https://mempool.space/address/${account.taproot.address}` : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[color:var(--sf-info-yellow-text)]/60 mt-1 hover:text-[#5b9cff] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer flex items-center gap-1"
              title={account?.taproot?.address ? `View ${account.taproot.address} on mempool.space` : 'No address'}
            >
              <span className="truncate">{account?.taproot?.address ? `${account.taproot.address.slice(0, 4)}...${account.taproot.address.slice(-3)}` : 'Not Found'}</span>
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

      {/* Token Assets - 60/40 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        {/* Alkanes Balances */}
        <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-6 flex flex-col" style={{ maxHeight: alkaneFilter === 'nfts' ? '720px' : '540px' }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
              <Coins size={24} className="text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('balances.protoruneAssets')}</h3>
          </div>

          {/* Tokens / NFTs / Positions tabs */}
          <div className="flex gap-4 mb-4">
            {(['tokens', 'positions', 'nfts'] as const).map((tab) => (
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
            let filtered = balances.alkanes.filter((a) => {
              if (alkaneFilter === 'positions') return isPosition(a);
              if (alkaneFilter === 'nfts') return isNft(a.balance) && !isPosition(a);
              // tokens: not an NFT and not a position
              return !isNft(a.balance) && !isPosition(a);
            });
            // Sort positions: LP tokens first, then staked positions
            if (alkaneFilter === 'positions') {
              filtered = [...filtered].sort((a, b) => {
                const aIsLp = isLpToken(a) ? 0 : 1;
                const bIsLp = isLpToken(b) ? 0 : 1;
                return aIsLp - bIsLp;
              });
            }

            const emptyLabels: Record<string, { title: string; hint: string }> = {
              tokens: { title: t('balances.noProtorune'), hint: t('balances.protoruneHint') },
              nfts: { title: t('balances.noNfts'), hint: t('balances.nftsHint') },
              positions: { title: t('balances.noPositions'), hint: t('balances.positionsHint') },
            };

            return filtered.length > 0 ? (
              alkaneFilter === 'nfts' ? (
              <div className="grid grid-cols-4 gap-3 overflow-y-auto flex-1 pr-1">
                {filtered.map((alkane) => {
                  const isExpanded = expandedAlkaneId === alkane.alkaneId;
                  return (
                    <NftCard
                      key={alkane.alkaneId}
                      alkane={alkane}
                      isExpanded={isExpanded}
                      network={network}
                      onToggle={() => setExpandedAlkaneId(isExpanded ? null : alkane.alkaneId)}
                      onSend={() => onSendAlkane?.(alkane)}
                      t={t}
                    />
                  );
                })}
              </div>
              ) : (
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                {filtered.map((alkane) => {
                  const isExpanded = expandedAlkaneId === alkane.alkaneId;
                  return (
                    <div
                      key={alkane.alkaneId}
                      className={`rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer`}
                      onClick={() => setExpandedAlkaneId(isExpanded ? null : alkane.alkaneId)}
                    >
                      <div className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          {(() => {
                            // Check if this alkane is an LP token by matching its ID to a pool
                            const pool = poolMap.get(alkane.alkaneId);
                            if (pool) {
                              return (
                                <div className="flex -space-x-2">
                                  <div className="relative z-10">
                                    <TokenIcon symbol={pool.token0Symbol} id={pool.token0Id} size="lg" network={network} />
                                  </div>
                                  <div className="relative">
                                    <TokenIcon symbol={pool.token1Symbol} id={pool.token1Id} size="lg" network={network} />
                                  </div>
                                </div>
                              );
                            }
                            return <TokenIcon symbol={alkane.symbol} id={alkane.alkaneId} size="lg" network={network} />;
                          })()}
                          <div>
                            <div className="font-medium text-[color:var(--sf-text)]">
                              {(() => {
                                const pool = poolMap.get(alkane.alkaneId);
                                if (pool) return `${pool.token0Symbol} / ${pool.token1Symbol} LP`;
                                // Enrich position name with deposit token name
                                if (isEnrichablePosition(alkane) && positionMeta?.[alkane.alkaneId]) {
                                  const meta = positionMeta[alkane.alkaneId];
                                  return `${meta.depositTokenName} ${alkane.name}`;
                                }
                                return alkane.name;
                              })()}
                            </div>
                            <div className="text-xs text-[color:var(--sf-text)]/40">{alkane.symbol ? `${alkane.symbol} · ` : ''}{alkane.alkaneId}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-[color:var(--sf-text)]">
                            {showValue(formatAlkaneBalance(alkane.balance, alkane.decimals, alkane))}
                          </div>
                          {!isLoadingData && (() => {
                            const decimals = alkane.decimals || 8;
                            const balanceFloat = Number(BigInt(alkane.balance)) / Math.pow(10, decimals);
                            const formatUsdValue = (usd: number) => (
                              <div className="text-xs text-[color:var(--sf-text)]/60">
                                ${usd < 0.01 ? '<0.01' : usd > 999.99
                                  ? Math.round(usd).toLocaleString()
                                  : usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            );
                            // Try per-token USD price from API
                            if (alkane.priceUsd && alkane.priceUsd > 0) {
                              return formatUsdValue(balanceFloat * alkane.priceUsd);
                            }
                            // frBTC: 1:1 with BTC
                            if ((alkane.symbol === 'frBTC' || alkane.alkaneId === '32:0') && bitcoinPrice?.usd) {
                              return formatUsdValue(balanceFloat * bitcoinPrice.usd);
                            }
                            // Satoshi price fallback with BTC price
                            if (alkane.priceInSatoshi && alkane.priceInSatoshi > 0 && bitcoinPrice?.usd) {
                              const pricePerUnitBtc = alkane.priceInSatoshi / 1e8;
                              return formatUsdValue(balanceFloat * pricePerUnitBtc * bitcoinPrice.usd);
                            }
                            // Derive price from pool reserves
                            const derived = derivedPrices.get(alkane.alkaneId);
                            if (derived && derived > 0) {
                              return formatUsdValue(balanceFloat * derived);
                            }
                            // LP token: user's share of pool TVL
                            const pool = poolMap.get(alkane.alkaneId);
                            if (pool) {
                              const p0 = derivedPrices.get(pool.token0Id);
                              const p1 = derivedPrices.get(pool.token1Id);
                              const totalSupply = Number(pool.lpTotalSupply);
                              if (p0 && p1 && totalSupply > 0) {
                                const r0 = Number(pool.token0Amount) / 1e8;
                                const r1 = Number(pool.token1Amount) / 1e8;
                                const poolTvl = r0 * p0 + r1 * p1;
                                const userShare = Number(BigInt(alkane.balance)) / totalSupply;
                                const userValue = userShare * poolTvl;
                                if (userValue > 0) {
                                  return formatUsdValue(userValue);
                                }
                              }
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="flex gap-2 px-4 pb-3">
                          {isLpToken(alkane) ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSendAlkane?.(alkane);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                              >
                                <Send size={12} />
                                {t('walletDash.send')}
                              </button>
                              <button
                                disabled
                                // TODO: Navigate to /swap with remove-liquidity mode for this LP position
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/30 text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-not-allowed"
                              >
                                <ArrowUpFromLine size={12} />
                                {t('walletDash.withdraw')}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSendAlkane?.(alkane);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                            >
                              <Send size={12} />
                              {t('walletDash.send')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              )
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
            <span className="text-lg font-medium">{network?.includes('regtest') ? t('balances.tabBrc20') : t('balances.comingSoon')}</span>
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
    </div>
  );
}

// --- NFT Card helpers ---

const NFT_GRADIENTS = [
  'from-blue-400 to-blue-600',
  'from-purple-400 to-purple-600',
  'from-green-400 to-green-600',
  'from-orange-400 to-orange-600',
  'from-pink-400 to-pink-600',
  'from-indigo-400 to-indigo-600',
  'from-teal-400 to-teal-600',
  'from-red-400 to-red-600',
];

function getNftGradient(sym: string) {
  const hash = sym.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return NFT_GRADIENTS[hash % NFT_GRADIENTS.length];
}

function getNftImagePaths(symbol: string, id: string, network: string): string[] {
  const paths: string[] = [];
  const symbolLower = symbol?.toLowerCase() || '';

  if (symbolLower === 'frbtc' || id === '32:0') {
    paths.push('/tokens/frbtc.svg');
    return paths;
  }
  if (id === '2:0' || symbolLower === 'diesel') {
    paths.push('https://asset.oyl.gg/alkanes/mainnet/2-0.png');
    return paths;
  }

  // Ordiscan CDN
  if (id && /^\d+:\d+/.test(id)) {
    const [block, tx] = id.split(':');
    paths.push(`https://cdn.ordiscan.com/alkanes/${block}_${tx}`);
  }
  // Oyl CDN
  if (id && /^\d+:\d+/.test(id)) {
    const urlSafeId = id.replace(/:/g, '-');
    paths.push(`https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`);
  }
  return paths;
}

function NftCard({ alkane, isExpanded, network, onToggle, onSend, t }: {
  alkane: AlkaneAsset;
  isExpanded: boolean;
  network: string;
  onToggle: () => void;
  onSend: () => void;
  t: (key: string) => string;
}) {
  const [imgError, setImgError] = useState(false);
  const [pathIndex, setPathIndex] = useState(0);
  const paths = useMemo(() => getNftImagePaths(alkane.symbol, alkane.alkaneId, network), [alkane.symbol, alkane.alkaneId, network]);
  const currentSrc = paths[pathIndex];
  const gradient = getNftGradient(alkane.symbol || alkane.alkaneId || '');

  useEffect(() => {
    setPathIndex(0);
    setImgError(false);
  }, [alkane.alkaneId]);

  const handleImgError = () => {
    if (pathIndex < paths.length - 1) {
      setPathIndex(pathIndex + 1);
    } else {
      setImgError(true);
    }
  };

  return (
    <div
      className="rounded-xl bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
      onClick={onToggle}
    >
      {/* Image area */}
      <div className="aspect-square relative overflow-hidden rounded-t-xl">
        {!imgError && currentSrc ? (
          <img
            src={currentSrc}
            alt={alkane.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={handleImgError}
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-white text-2xl font-bold opacity-60">
              {(alkane.symbol || alkane.alkaneId || '??').slice(0, 2).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Bottom area — 1/3 of card */}
      <div className="p-2">
        {isExpanded ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSend();
            }}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          >
            <Send size={12} />
            {t('walletDash.send')}
          </button>
        ) : (
          <>
            <div className="font-medium text-[color:var(--sf-text)] text-xs truncate">{alkane.name}</div>
            <div className="text-[10px] text-[color:var(--sf-text)]/40 truncate">{alkane.alkaneId}</div>
          </>
        )}
      </div>
    </div>
  );
}
