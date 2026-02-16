'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePools } from '@/hooks/usePools';
import { RefreshCw, Send, ArrowUpFromLine, ArrowLeftRight } from 'lucide-react';
import TokenIcon from '@/app/components/TokenIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { usePositionMetadata, isEnrichablePosition } from '@/hooks/usePositionMetadata';

import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';

const FRBTC_ID = '32:0';

interface AlkanesBalancesCardProps {
  onSendAlkane?: (alkane: AlkaneAsset) => void;
}

export default function AlkanesBalancesCard({ onSendAlkane }: AlkanesBalancesCardProps) {
  const { network } = useWallet() as any;
  const { bitcoinPrice } = useAlkanesSDK();
  const { t } = useTranslation();
  const { balances, isLoading, error, refresh } = useEnrichedWalletData();
  const { data: poolsData } = usePools();
  const { data: positionMeta } = usePositionMetadata(balances.alkanes);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedAlkaneId, setExpandedAlkaneId] = useState<string | null>(null);
  const [alkaneFilter, setAlkaneFilter] = useState<'tokens' | 'nfts' | 'positions'>('tokens');
  const hasAutoRefreshed = useRef(false);

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

  const derivedPrices = useMemo(() => {
    const prices = new Map<string, number>();
    if (!bitcoinPrice?.usd || !poolsData?.items) return prices;
    prices.set(FRBTC_ID, bitcoinPrice.usd);
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
  }, [poolsData, bitcoinPrice]);

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

  const isLoadingData = isLoading || isRefreshing;

  // Auto-refresh alkanes once after 15 seconds if no tokens found
  const hasNoTokens = useMemo(() => {
    const tokens = balances.alkanes.filter((a) => {
      const isNftAsset = BigInt(a.balance) === BigInt(1);
      const isPositionAsset = /\bLP\b/i.test(a.symbol) || /\bLP\b/i.test(a.name) || a.symbol.startsWith('POS-') || a.name.startsWith('POS-');
      return !isNftAsset && !isPositionAsset;
    });
    return tokens.length === 0;
  }, [balances.alkanes]);

  useEffect(() => {
    // Only auto-refresh once, when not loading, and when no tokens found
    if (hasAutoRefreshed.current || isLoading || !hasNoTokens) {
      return;
    }

    const timer = setTimeout(() => {
      if (!hasAutoRefreshed.current && hasNoTokens) {
        console.log('[AlkanesBalancesCard] Auto-refreshing alkanes after 15s (no tokens found)');
        hasAutoRefreshed.current = true;
        handleRefresh();
      }
    }, 15000);

    return () => clearTimeout(timer);
  }, [hasNoTokens, isLoading]);

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
    if (value === BigInt(1)) {
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
    const isFrbtc = alkane && (alkane.symbol === 'frBTC' || alkane.name === 'frBTC');
    if (isFrbtc) {
      return `${wholeStr}.${remainderStr.slice(0, 8)}`;
    }
    if (whole >= BigInt(10000)) {
      return wholeStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    const decimalPlaces = wholeStr.length >= 3 ? 2 : 4;
    const truncatedRemainder = remainderStr.slice(0, decimalPlaces);
    return `${wholeStr}.${truncatedRemainder}`;
  };

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

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] flex flex-col" style={{ maxHeight: alkaneFilter === 'nfts' ? '720px' : '600px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20 border border-blue-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" width={20} height={20} fill="currentColor" viewBox="0 0 256 256" className="text-blue-400"><path d="M184,89.57V84c0-25.08-37.83-44-88-44S8,58.92,8,84v40c0,20.89,26.25,37.49,64,42.46V172c0,25.08,37.83,44,88,44s88-18.92,88-44V132C248,111.3,222.58,94.68,184,89.57ZM232,132c0,13.22-30.79,28-72,28-3.73,0-7.43-.13-11.08-.37C170.49,151.77,184,139,184,124V105.74C213.87,110.19,232,122.27,232,132ZM72,150.25V126.46A183.74,183.74,0,0,0,96,128a183.74,183.74,0,0,0,24-1.54v23.79A163,163,0,0,1,96,152,163,163,0,0,1,72,150.25Zm96-40.32V124c0,8.39-12.41,17.4-32,22.87V123.5C148.91,120.37,159.84,115.71,168,109.93ZM96,56c41.21,0,72,14.78,72,28s-30.79,28-72,28S24,97.22,24,84,54.79,56,96,56ZM24,124V109.93c8.16,5.78,19.09,10.44,32,13.57v23.37C36.41,141.4,24,132.39,24,124Zm64,48v-4.17c2.63.1,5.29.17,8,.17,3.88,0,7.67-.13,11.39-.35A121.92,121.92,0,0,0,120,171.41v23.46C100.41,189.4,88,180.39,88,172Zm48,26.25V174.4a179.48,179.48,0,0,0,24,1.6,183.74,183.74,0,0,0,24-1.54v23.79a165.45,165.45,0,0,1-48,0Zm64-3.38V171.5c12.91-3.13,23.84-7.79,32-13.57V172C232,180.39,219.59,189.4,200,194.87Z"></path></svg>
          </div>
          <h3 className="text-lg font-bold text-[color:var(--sf-text)]">{t('balances.protoruneAssets')}</h3>
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

      {/* Tokens / NFTs / Positions tabs */}
      <div className="flex gap-4 mb-4 border-b border-[color:var(--sf-outline)]">
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

      {/* Token List */}
      {(() => {
        let filtered = balances.alkanes.filter((a) => {
          if (alkaneFilter === 'positions') return isPosition(a);
          if (alkaneFilter === 'nfts') return isNft(a.balance) && !isPosition(a);
          return !isNft(a.balance) && !isPosition(a);
        });
        if (alkaneFilter === 'positions') {
          filtered = [...filtered].sort((a, b) => {
            const aIsLp = isLpToken(a) ? 0 : 1;
            const bIsLp = isLpToken(b) ? 0 : 1;
            if (aIsLp !== bIsLp) return aIsLp - bIsLp;
            const parsePositionName = (name: string) => {
              const match = name.match(/^(.*?)(\d+)\s*$/);
              if (match) return { prefix: match[1].trim(), num: parseInt(match[2], 10) };
              return { prefix: name.trim(), num: -1 };
            };
            const pa = parsePositionName(a.name);
            const pb = parsePositionName(b.name);
            const cmp = pa.prefix.localeCompare(pb.prefix);
            if (cmp !== 0) return cmp;
            return pa.num - pb.num;
          });
        }
        if (alkaneFilter === 'nfts') {
          filtered = [...filtered].sort((a, b) => {
            const parseNftName = (name: string) => {
              const match = name.match(/^(.*?)(\d+)\s*$/);
              if (match) return { prefix: match[1].trim(), num: parseInt(match[2], 10) };
              return { prefix: name.trim(), num: -1 };
            };
            const pa = parseNftName(a.name);
            const pb = parseNftName(b.name);
            const cmp = pa.prefix.localeCompare(pb.prefix);
            if (cmp !== 0) return cmp;
            return pa.num - pb.num;
          });
        }

        const emptyLabels: Record<string, { title: string; hint: string }> = {
          tokens: { title: t('balances.noProtorune'), hint: t('balances.protoruneHint') },
          nfts: { title: t('balances.noNfts'), hint: t('balances.nftsHint') },
          positions: { title: t('balances.noPositions'), hint: t('balances.positionsHint') },
        };

        return filtered.length > 0 ? (
          alkaneFilter === 'nfts' ? (
          <div className="grid grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto flex-1 pr-1">
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
          <div className="space-y-2 overflow-y-auto flex-1 pr-1">
            {filtered.map((alkane) => {
              const isExpanded = expandedAlkaneId === alkane.alkaneId;
              return (
                <div
                  key={alkane.alkaneId}
                  className="rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                  onClick={() => setExpandedAlkaneId(isExpanded ? null : alkane.alkaneId)}
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => {
                        const pool = poolMap.get(alkane.alkaneId);
                        if (pool) {
                          return (
                            <div className="flex -space-x-2 shrink-0">
                              <div className="relative z-10">
                                <TokenIcon symbol={pool.token0Symbol} id={pool.token0Id} size="md" network={network} />
                              </div>
                              <div className="relative">
                                <TokenIcon symbol={pool.token1Symbol} id={pool.token1Id} size="md" network={network} />
                              </div>
                            </div>
                          );
                        }
                        return <TokenIcon symbol={alkane.symbol} id={alkane.alkaneId} size="md" network={network} />;
                      })()}
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-[color:var(--sf-text)] truncate">
                          {(() => {
                            const pool = poolMap.get(alkane.alkaneId);
                            if (pool) return `${pool.token0Symbol}/${pool.token1Symbol} LP`;
                            if (isEnrichablePosition(alkane) && positionMeta?.[alkane.alkaneId]) {
                              const meta = positionMeta[alkane.alkaneId];
                              return `${meta.depositTokenName} ${alkane.name}`;
                            }
                            return alkane.name;
                          })()}
                        </div>
                        <div className="text-[10px] text-[color:var(--sf-text)]/40 truncate">{alkane.symbol ? `${alkane.symbol} · ` : ''}{alkane.alkaneId}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="font-bold text-sm text-[color:var(--sf-text)]">
                        {showValue(formatAlkaneBalance(alkane.balance, alkane.decimals, alkane))}
                      </div>
                      {!isLoadingData && (() => {
                        const decimals = alkane.decimals || 8;
                        const balanceFloat = Number(BigInt(alkane.balance)) / Math.pow(10, decimals);
                        const formatUsdValue = (usd: number) => (
                          <div className="text-[10px] text-[color:var(--sf-text)]/60">
                            ${usd < 0.01 ? '<0.01' : usd > 999.99
                              ? Math.round(usd).toLocaleString()
                              : usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        );
                        if (alkane.priceUsd && alkane.priceUsd > 0) {
                          return formatUsdValue(balanceFloat * alkane.priceUsd);
                        }
                        if ((alkane.symbol === 'frBTC' || alkane.alkaneId === '32:0') && bitcoinPrice?.usd) {
                          return formatUsdValue(balanceFloat * bitcoinPrice.usd);
                        }
                        if (alkane.priceInSatoshi && alkane.priceInSatoshi > 0 && bitcoinPrice?.usd) {
                          const pricePerUnitBtc = alkane.priceInSatoshi / 1e8;
                          return formatUsdValue(balanceFloat * pricePerUnitBtc * bitcoinPrice.usd);
                        }
                        const derived = derivedPrices.get(alkane.alkaneId);
                        if (derived && derived > 0) {
                          return formatUsdValue(balanceFloat * derived);
                        }
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
                            if (userValue > 0) return formatUsdValue(userValue);
                          }
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="flex gap-2 px-3 pb-3">
                      {isLpToken(alkane) ? (
                        <>
                          <button
                            data-testid="send-button"
                            onClick={(e) => { e.stopPropagation(); onSendAlkane?.(alkane); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <Send size={12} />
                            {t('walletDash.send')}
                          </button>
                          <button
                            disabled
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/30 text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-not-allowed"
                          >
                            <ArrowUpFromLine size={12} />
                            {t('walletDash.withdraw')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            data-testid="send-button"
                            onClick={(e) => { e.stopPropagation(); onSendAlkane?.(alkane); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <Send size={12} />
                            {t('walletDash.send')}
                          </button>
                          <button
                            disabled
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/30 text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-not-allowed"
                          >
                            <ArrowLeftRight size={12} />
                            {t('walletDash.swap')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )
        ) : (
          <div className="text-center py-8 text-[color:var(--sf-text)]/60 flex-1 flex flex-col items-center justify-center">
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
    paths.push('https://cdn.subfrost.io/alkanes/2_0');
    return paths;
  }
  if (id && /^\d+:\d+/.test(id)) {
    const urlSafeId = id.replace(/:/g, '_');
    paths.push(`https://cdn.subfrost.io/alkanes/${urlSafeId}`);
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
      <div className="p-2">
        {isExpanded ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSend(); }}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
          >
            <Send size={12} />
            {t('walletDash.send')}
          </button>
        ) : (
          <>
            <div className="font-medium text-[color:var(--sf-text)] text-xs truncate">{alkane.name}</div>
            <div className="text-[10px] text-[color:var(--sf-text)]/40 truncate">{alkane.symbol ? `${alkane.symbol} · ` : ''}{alkane.alkaneId}</div>
          </>
        )}
      </div>
    </div>
  );
}
