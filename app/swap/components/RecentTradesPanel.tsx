'use client';

import { useMemo, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { usePools } from '@/hooks/usePools';
import TokenIcon from '@/app/components/TokenIcon';
import { useWallet } from '@/context/WalletContext';
import type { Network } from '@/utils/constants';

interface Trade {
  id: string;
  soldFormatted: string;
  boughtFormatted: string;
  fromSymbol: string;
  fromId: string;
  toSymbol: string;
  toId: string;
  type: 'Market' | 'Limit';
  time: string;
}

interface Props {
  baseToken: string;
  quoteToken: string;
}

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  '32:0': 'frBTC',
  '2:0': 'DIESEL',
  '2:56801': 'bUSD',
};

function formatAmount(raw: string, decimals = 8, tokenSymbol?: string) {
  const n = Number(raw ?? '0');
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return '0';
  const fractionDigits = (tokenSymbol === 'BTC' || tokenSymbol === 'frBTC') ? 5 : 2;
  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${(Math.pow(10, -fractionDigits)).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
}

export default function RecentTradesPanel({ baseToken, quoteToken }: Props) {
  const { network } = useWallet() as { network: Network };
  const { data: poolsData } = usePools();

  // Find pool ID for the selected pair
  const poolId = useMemo(() => {
    if (!poolsData?.items || !baseToken || !quoteToken) return null;
    const pool = poolsData.items.find(p =>
      (p.token0.id === baseToken && p.token1.id === quoteToken) ||
      (p.token0.id === quoteToken && p.token1.id === baseToken)
    );
    return pool?.id || null;
  }, [poolsData, baseToken, quoteToken]);

  const PAGE_SIZE = 30;

  // Fetch swap history for this specific pool — paginated, direct REST
  const { data: swapPages, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['pool-swap-history', network, poolId],
    enabled: !!poolId && !!network,
    staleTime: Infinity,
    initialPageParam: 0,
    getNextPageParam: (lastPage: any[], _all: any[][], lastPageParam: number) =>
      lastPage.length >= PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
    queryFn: async ({ pageParam }) => {
      const rpcBase = `/api/rpc/${network || 'mainnet'}`;
      const [b, t] = poolId!.split(':');
      const resp = await fetch(`${rpcBase}/get-pool-swap-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          poolId: { block: b, tx: t },
          limit: PAGE_SIZE,
          offset: pageParam,
        }),
      });
      if (!resp.ok) return [];
      const json = await resp.json();
      const swaps = json?.data?.items?.swaps || json?.data?.swaps || json?.data?.items || json?.data || [];
      return Array.isArray(swaps) ? swaps : [];
    },
  });

  const swapItems = useMemo(() => swapPages?.pages?.flat() || [], [swapPages]);

  // Get token names from pool data
  const pairPool = useMemo(() => {
    if (!poolsData?.items || !poolId) return null;
    return poolsData.items.find(p => p.id === poolId) || null;
  }, [poolsData, poolId]);

  const getName = (id: string) => {
    if (pairPool?.token0.id === id) return pairPool.token0.symbol || pairPool.token0.name || id;
    if (pairPool?.token1.id === id) return pairPool.token1.symbol || pairPool.token1.name || id;
    return KNOWN_TOKEN_NAMES[id] || id;
  };

  const trades: Trade[] = useMemo(() => {
    if (!swapItems?.length) return [];

    return swapItems.map((item: any, idx: number) => {
      // Handle both formats:
      // Format 1 (get-pool-swap-history): { pay: { amount, tokenId: {block,tx} }, receive: { ... } }
      // Format 2 (get-all-amm-tx-history): { soldAmount, soldTokenBlockId, soldTokenTxId, ... }
      const pay = item.pay;
      const receive = item.receive;

      const fromId = pay?.tokenId
        ? `${pay.tokenId.block}:${pay.tokenId.tx}`
        : (item.soldTokenBlockId && item.soldTokenTxId)
          ? `${item.soldTokenBlockId}:${item.soldTokenTxId}` : '';
      const toId = receive?.tokenId
        ? `${receive.tokenId.block}:${receive.tokenId.tx}`
        : (item.boughtTokenBlockId && item.boughtTokenTxId)
          ? `${item.boughtTokenBlockId}:${item.boughtTokenTxId}` : '';

      const fromSymbol = getName(fromId);
      const toSymbol = getName(toId);

      const soldFormatted = formatAmount(pay?.amount || item.soldAmount || '0', 8, fromSymbol);
      const boughtFormatted = formatAmount(receive?.amount || item.boughtAmount || '0', 8, toSymbol);

      const type: 'Market' | 'Limit' = item.orderType === 'limit' ? 'Limit' : 'Market';

      let time = '--:--:--';
      if (item.timestamp) {
        const d = new Date(typeof item.timestamp === 'number' ? item.timestamp * 1000 : item.timestamp);
        time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }

      return {
        id: `${item.transactionId || item.txid || item.transactionHash || 'trade'}-${idx}`,
        soldFormatted,
        boughtFormatted,
        fromSymbol,
        fromId,
        toSymbol,
        toId,
        type,
        time,
      };
    });
  }, [swapItems, pairPool]);

  // Infinite scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasNextPage || isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <div>
      <div className="sf-table-header grid grid-cols-[0.5fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 px-3 py-2">
        <span>Type</span>
        <span>From</span>
        <span>To</span>
        <span className="text-right">Amounts</span>
        <span className="text-right">Time</span>
      </div>

      <div ref={scrollRef} className="max-h-[240px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[color:var(--sf-text)]/20">
            <span className="text-xs">{poolId ? 'No recent trades for this pair' : 'Select a pair'}</span>
          </div>
        ) : trades.map(trade => (
          <div
            key={trade.id}
            className="sf-row grid grid-cols-[0.5fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 text-[11px] leading-[20px] px-3 py-1.5 items-center"
          >
            <span className="text-[color:var(--sf-text)]/40">{trade.type}</span>

            <div className="flex items-center gap-1 min-w-0">
              <TokenIcon symbol={trade.fromSymbol} id={trade.fromId} size="sm" network={network} />
              <span className="text-[color:var(--sf-text)]/60 truncate">{trade.fromSymbol}</span>
            </div>

            <div className="flex items-center gap-1 min-w-0">
              <TokenIcon symbol={trade.toSymbol} id={trade.toId} size="sm" network={network} />
              <span className="text-[color:var(--sf-text)]/60 truncate">{trade.toSymbol}</span>
            </div>

            <span className="text-right tabular-nums truncate">
              <span className="text-[color:var(--sf-text)]/60">-{trade.soldFormatted} {trade.fromSymbol}</span>
              <span className="text-[color:var(--sf-text)]/25">{', '}</span>
              <span className="text-green-400">+{trade.boughtFormatted} {trade.toSymbol}</span>
            </span>

            <span className="text-[color:var(--sf-text)]/25 tabular-nums text-right">{trade.time}</span>
          </div>
        ))}
        {isFetchingNextPage && (
          <div className="py-2 text-center text-xs text-[color:var(--sf-text)]/20">Loading...</div>
        )}
      </div>
    </div>
  );
}
