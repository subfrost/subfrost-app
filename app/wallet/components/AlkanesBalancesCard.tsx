'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePools } from '@/hooks/usePools';
import { usePendingTxs } from '@/hooks/usePendingTxs';
import { RefreshCw, Send, ArrowUpFromLine, ArrowLeftRight, Flame } from 'lucide-react';
import TokenIcon from '@/app/components/TokenIcon';
import { useTranslation } from '@/hooks/useTranslation';
import { usePositionMetadata, isEnrichablePosition } from '@/hooks/usePositionMetadata';
import { useFuelAllocation } from '@/hooks/useFuelAllocation';
import { saveSwapIntent } from '@/app/swap/swapPair';

import type { AlkaneAsset } from '@/hooks/useEnrichedWalletData';

const FRBTC_ID = '32:0';
const DIESEL_ID = '2:0';
const BITCOIN_ASSET_ID = 'BTC';
export type AlkaneBalanceFilter = 'tokens' | 'nfts' | 'positions' | 'fuel';

interface AlkanesBalancesCardProps {
  onSendAlkane?: (alkane: AlkaneAsset) => void;
  onSendBitcoin?: () => void;
  embedded?: boolean;
  hideHeader?: boolean;
  hideTabs?: boolean;
  filter?: AlkaneBalanceFilter;
  onFilterChange?: (filter: AlkaneBalanceFilter) => void;
}

export default function AlkanesBalancesCard({
  onSendAlkane,
  onSendBitcoin,
  embedded = false,
  hideHeader = false,
  hideTabs = false,
  filter,
  onFilterChange,
}: AlkanesBalancesCardProps) {
  const { network } = useWallet() as any;
  // Single source of truth for BTC price (queries/market.ts).
  const { data: btcPriceUsd = 0 } = useBtcPrice();
  const { t } = useTranslation();
  const router = useRouter();
  const { balances, btcFast, isAlkanesLoading, error, refreshAlkanes } = useEnrichedWalletData();
  const { data: poolsData } = usePools();
  const { alkaneDeltas: pendingAlkaneDeltas, pendingTxs } = usePendingTxs();

  // Build a per-alkaneId map of {delta, uncertain}. A tx flagged
  // contract_outputs_uncertain may still have edict-confirmed
  // input-side deltas (e.g. a swap that consumes 1000 DIESEL but
  // produces an uncertain amount of frBTC). To keep the overlay
  // honest, we mark a row as uncertain only when one of the
  // contributing pending txs flagged itself uncertain AND included
  // this alkaneId in its own alkane delta list.
  const pendingByAlkane = useMemo(() => {
    const map = new Map<string, { delta: bigint; uncertain: boolean }>();
    for (const d of pendingAlkaneDeltas) {
      const key = `${d.alkaneId.block}:${d.alkaneId.tx}`;
      map.set(key, { delta: d.delta, uncertain: false });
    }
    for (const tx of pendingTxs) {
      if (!tx.contractOutputsUncertain) continue;
      for (const a of tx.alkaneDeltas) {
        const key = `${a.alkaneId.block}:${a.alkaneId.tx}`;
        const cur = map.get(key);
        if (cur) cur.uncertain = true;
      }
    }
    return map;
  }, [pendingAlkaneDeltas, pendingTxs]);
  const { data: positionMeta } = usePositionMetadata(balances.alkanes);
  const fuelAllocation = useFuelAllocation();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedAlkaneId, setExpandedAlkaneId] = useState<string | null>(null);
  const [internalAlkaneFilter, setInternalAlkaneFilter] = useState<AlkaneBalanceFilter>('tokens');
  const alkaneFilter = filter ?? internalAlkaneFilter;
  const setAlkaneFilter = onFilterChange ?? setInternalAlkaneFilter;
  // hasAutoRefreshed: removed in 2026-05-04 along with the auto-retry useEffect.

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
    if (!btcPriceUsd || !poolsData?.items) return prices;
    prices.set(FRBTC_ID, btcPriceUsd);
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

  const btcSats = btcFast && btcFast.total > 0 ? btcFast.total : balances.bitcoin.total;
  const bitcoinAsset: AlkaneAsset = {
    alkaneId: BITCOIN_ASSET_ID,
    balance: String(btcSats),
    decimals: 8,
    symbol: 'BTC',
    name: 'Bitcoin',
    priceUsd: btcPriceUsd || undefined,
  };

  const isBitcoinAsset = (alkane: { alkaneId?: string; symbol?: string }) =>
    alkane.alkaneId === BITCOIN_ASSET_ID || alkane.symbol === 'BTC';

  const getUsdValue = (alkane: AlkaneAsset): number => {
    const decimals = alkane.decimals || 8;
    const balanceFloat = Number(BigInt(alkane.balance)) / Math.pow(10, decimals);
    if (!Number.isFinite(balanceFloat) || balanceFloat <= 0) return 0;
    if (isBitcoinAsset(alkane) && btcPriceUsd) return balanceFloat * btcPriceUsd;
    if (alkane.priceUsd && alkane.priceUsd > 0) return balanceFloat * alkane.priceUsd;
    if ((alkane.symbol === 'frBTC' || alkane.alkaneId === FRBTC_ID) && btcPriceUsd) {
      return balanceFloat * btcPriceUsd;
    }
    if (alkane.priceInSatoshi && alkane.priceInSatoshi > 0 && btcPriceUsd) {
      return balanceFloat * (alkane.priceInSatoshi / 1e8) * btcPriceUsd;
    }
    const derived = derivedPrices.get(alkane.alkaneId);
    if (derived && derived > 0) return balanceFloat * derived;
    return 0;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      void refreshAlkanes().catch((err) => {
        console.warn('[AlkanesBalancesCard] refreshAlkanes failed:', err);
      });
      await new Promise(resolve => setTimeout(resolve, 700));
    } finally {
      setIsRefreshing(false);
    }
  };

  const isLoadingData = isAlkanesLoading || isRefreshing;

  // Swap links use the public /swap query-param contract, matching OYL:
  // /swap?from=2:0&to=btc
  const getSwapHref = (alkane: AlkaneAsset) => {
    if (isBitcoinAsset(alkane)) return `/swap?from=btc&to=${DIESEL_ID}`;
    const isFrbtc = alkane.alkaneId === FRBTC_ID || alkane.symbol === 'frBTC';
    const from = encodeURIComponent(isFrbtc ? FRBTC_ID : alkane.alkaneId);
    const to = encodeURIComponent(isFrbtc ? DIESEL_ID : 'btc');
    return `/swap?from=${from}&to=${to}`;
  };

  // Click "Remove" under an LP position row → open /swap with the liquidity
  // panel in remove mode and this position pre-selected.
  const handleRemoveLiquidity = (alkane: AlkaneAsset) => {
    saveSwapIntent({ kind: 'removeLiquidity', positionId: alkane.alkaneId });
    router.push('/swap');
  };

  // Auto-retry useEffect removed (2026-05-04).
  //
  // Why it existed: the previous balance fetch path (espo
  // /get-alkanes-by-address) would intermittently return an empty list
  // when the indexer lagged. The retry was a hack to paper over that.
  //
  // Why it has to go: after 9ec751fb the balance source is canonical
  // (UTXO set) — when it returns 0 alkanes, the wallet *actually has 0*.
  // The retry was firing on the legitimately-empty case, calling
  // refreshAlkanes() which invalidates the query, which races against the
  // earlier-resolved good fetch and overwrites it. Net effect: balance
  // shows correctly, then 3s later flickers to "no alkanes" or fractional,
  // then the manual reload button restores it. That's exactly the symptom
  // gabe reported on staging-app. Removing the retry kills the race.
  //
  // The reload button still works for genuine "I just received funds and
  // want to see them now" cases — manual user action, no race window.

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
    if (alkane && isBitcoinAsset(alkane)) {
      return `${(Number(value) / 1e8).toFixed(8)} BTC`;
    }
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

  const formatFuelAmount = (amount: number): string => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  if (error) {
    return (
      <div className={embedded ? '' : 'h-full rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)]'}>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-red-400 mb-4">{error}</div>
          <button
            onClick={refreshAlkanes}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
          >
            {t('balances.tryAgain')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={embedded
        ? 'flex flex-col min-h-0'
        : 'h-full rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md border-t border-[color:var(--sf-top-highlight)] flex flex-col'}
      style={embedded ? undefined : { maxHeight: alkaneFilter === 'nfts' ? '720px' : '600px' }}
    >
      {!embedded && !hideHeader && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <img src="/tokens/diesel-white.svg" alt="" className="h-7 w-7 shrink-0" aria-hidden="true" />
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
      )}

      {!hideTabs && (
        <div className="sf-tab-group mb-4">
          {((['tokens', 'positions', 'nfts', ...(fuelAllocation.isEligible ? ['fuel'] : [])] as const) as readonly AlkaneBalanceFilter[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setAlkaneFilter(tab)}
              className={`sf-tab-btn ${alkaneFilter === tab ? 'sf-tab-btn--active' : ''}`}
            >
              {tab === 'tokens' ? t('balances.tabTokens')
                : tab === 'nfts' ? t('balances.tabNfts')
                : tab === 'fuel' ? t('balances.tabFuel')
                : t('balances.tabPositions')}
            </button>
          ))}
        </div>
      )}

      {/* FUEL allocation tab — visible only to wallets on the allocation list */}
      {alkaneFilter === 'fuel' ? (
        <div className="overflow-y-auto flex-1 no-scrollbar">
          <div className="rounded-lg bg-[color:var(--sf-primary)]/5 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                <Flame size={16} className="text-amber-400" />
              </div>
              <div>
                <div className="text-sm text-[color:var(--sf-text)]/60 mb-1">{t('balances.fuelAllocation')}</div>
                <div className="text-lg sm:text-xl font-bold text-[color:var(--sf-text)]">
                  {formatFuelAmount(fuelAllocation.amount)} FUEL
                </div>
              </div>
            </div>
            <div className="mt-4 p-4 border-t border-amber-500/20">
              <p className="text-xs text-[color:var(--sf-text)]/60 leading-relaxed">
                {t('balances.fuelNote')}
              </p>
            </div>
          </div>
        </div>
      ) : (() => {
        // Ghost rows: alkane IDs with a pending delta but no confirmed
        // row yet (first-receive case — user is about to receive a
        // token they've never held). Add them as zero-balance entries
        // so the pending overlay has something to attach to.
        const ghostAlkanes: AlkaneAsset[] = [];
        const confirmedIds = new Set(balances.alkanes.map((a) => a.alkaneId));
        for (const [id] of pendingByAlkane) {
          if (confirmedIds.has(id)) continue;
          const poolMatch = poolMap.get(id);
          ghostAlkanes.push({
            alkaneId: id,
            balance: '0',
            decimals: 8,
            symbol: poolMatch ? `${poolMatch.token0Symbol}/${poolMatch.token1Symbol} LP` : '',
            name: poolMatch ? `${poolMatch.token0Symbol}/${poolMatch.token1Symbol} LP` : id,
          } as AlkaneAsset);
        }
        const merged = alkaneFilter === 'tokens'
          ? [bitcoinAsset, ...balances.alkanes, ...ghostAlkanes]
          : [...balances.alkanes, ...ghostAlkanes];

        let filtered = merged.filter((a) => {
          if (alkaneFilter === 'positions') return isPosition(a);
          if (alkaneFilter === 'nfts') return isNft(a.balance) && !isPosition(a);
          return isBitcoinAsset(a) || (!isNft(a.balance) && !isPosition(a));
        });
        // Token sort handled by query (frBTC → DIESEL → USD value → block:tx)
        if (alkaneFilter === 'tokens') {
          filtered = [...filtered].sort((a, b) => {
            if (isBitcoinAsset(a)) return -1;
            if (isBitcoinAsset(b)) return 1;
            const usdDelta = getUsdValue(b) - getUsdValue(a);
            if (usdDelta !== 0) return usdDelta;
            const [aBlock, aTx] = a.alkaneId.split(':').map(Number);
            const [bBlock, bTx] = b.alkaneId.split(':').map(Number);
            return aBlock !== bBlock ? aBlock - bBlock : aTx - bTx;
          });
        }
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
          <div className="space-y-2 overflow-y-auto flex-1 no-scrollbar">
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
                      <div className="min-w-0 [&>div:last-child]:text-xs">
                        <div className="font-bold text-sm text-[color:var(--sf-text)] truncate">
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
                        <div className="text-[10px] text-[color:var(--sf-text)]/40 truncate">
                          {isBitcoinAsset(alkane) ? BITCOIN_ASSET_ID : `${alkane.symbol ? `${alkane.symbol} · ` : ''}${alkane.alkaneId}`}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="font-bold text-sm text-[color:var(--sf-text)]">
                        {showValue(formatAlkaneBalance(alkane.balance, alkane.decimals, alkane))}
                      </div>
                      {(() => {
                        const pending = pendingByAlkane.get(alkane.alkaneId);
                        if (!pending || pending.delta === 0n) return null;
                        const decimals = alkane.decimals || 8;
                        const sign = pending.delta < 0n ? '-' : '+';
                        const abs = pending.delta < 0n ? -pending.delta : pending.delta;
                        const divisor = BigInt(10 ** decimals);
                        const whole = abs / divisor;
                        const remainder = abs % divisor;
                        const wholeStr = whole.toString();
                        const remainderStr = remainder.toString().padStart(decimals, '0');
                        const dp = wholeStr.length >= 3 ? 2 : 4;
                        const formatted = `${wholeStr}.${remainderStr.slice(0, dp)}`;
                        const label = pending.uncertain ? `${sign}? ${alkane.symbol || ''}` : `${sign}${formatted} ${alkane.symbol || ''}`;
                        return (
                          <div className="text-[10px] text-amber-300/80" title={pending.uncertain ? 'Contract output amount is uncertain until the swap confirms' : 'Pending mempool delta — overlays confirmed balance'}>
                            {label.trim()} pending
                          </div>
                        );
                      })()}
                      {!isLoadingData && (() => {
                        const decimals = alkane.decimals || 8;
                        const balanceFloat = Number(BigInt(alkane.balance)) / Math.pow(10, decimals);
                        const formatUsdValue = (usd: number) => (
                          <div className="text-xs text-[color:var(--sf-text)]/60">
                            ${usd < 0.01 ? '<0.01' : usd > 999.99
                              ? Math.round(usd).toLocaleString()
                              : usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                          </div>
                        );
                        if (alkane.priceUsd && alkane.priceUsd > 0) {
                          return formatUsdValue(balanceFloat * alkane.priceUsd);
                        }
                        if ((alkane.symbol === 'frBTC' || alkane.alkaneId === '32:0') && btcPriceUsd) {
                          return formatUsdValue(balanceFloat * btcPriceUsd);
                        }
                        if (alkane.priceInSatoshi && alkane.priceInSatoshi > 0 && btcPriceUsd) {
                          const pricePerUnitBtc = alkane.priceInSatoshi / 1e8;
                          return formatUsdValue(balanceFloat * pricePerUnitBtc * btcPriceUsd);
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
                    <div className="flex gap-2 p-3">
                      {isBitcoinAsset(alkane) ? (
                        <>
                          <button
                            data-testid="send-button"
                            onClick={(e) => { e.stopPropagation(); onSendBitcoin?.(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <Send size={16} />
                            {t('walletDash.send')}
                          </button>
                          <Link
                            href={getSwapHref(alkane)}
                            data-testid="swap-button"
                            onClick={(e) => { e.stopPropagation(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide no-underline hover:no-underline shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <ArrowLeftRight size={16} />
                            {t('walletDash.swap')}
                          </Link>
                        </>
                      ) : isLpToken(alkane) ? (
                        <>
                          <button
                            data-testid="send-button"
                            onClick={(e) => { e.stopPropagation(); onSendAlkane?.(alkane); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <Send size={16} />
                            {t('walletDash.send')}
                          </button>
                          <button
                            data-testid="remove-button"
                            onClick={(e) => { e.stopPropagation(); handleRemoveLiquidity(alkane); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <ArrowUpFromLine size={16} />
                            {t('walletDash.remove')}
                          </button>
                        </>
                      ) : isStakedPosition(alkane) ? (
                        <>
                          <button
                            data-testid="send-button"
                            onClick={(e) => { e.stopPropagation(); onSendAlkane?.(alkane); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <Send size={16} />
                            {t('walletDash.send')}
                          </button>
                          <button
                            disabled
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-panel-bg)] text-[color:var(--sf-text)]/30 text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] cursor-not-allowed"
                          >
                            <ArrowLeftRight size={16} />
                            {t('walletDash.swap')}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            data-testid="send-button"
                            onClick={(e) => { e.stopPropagation(); onSendAlkane?.(alkane); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <Send size={16} />
                            {t('walletDash.send')}
                          </button>
                          <Link
                            href={getSwapHref(alkane)}
                            data-testid="swap-button"
                            onClick={(e) => { e.stopPropagation(); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[color:var(--sf-primary)] text-white text-xs font-bold uppercase tracking-wide no-underline hover:no-underline shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                          >
                            <ArrowLeftRight size={16} />
                            {t('walletDash.swap')}
                          </Link>
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
            <Send size={16} />
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
