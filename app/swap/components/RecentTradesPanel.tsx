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
  type: 'Market' | 'Limit' | 'Wrap' | 'Unwrap';
  time: string;
}

interface Props {
  baseToken: string;
  quoteToken: string;
  poolId?: string;
  isWrapPair?: boolean;
}

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  '32:0': 'frBTC',
  '2:0': 'DIESEL',
  '2:56801': 'bUSD',
};

function formatAmount(raw: string, decimals = 8, tokenSymbol?: string, opts?: { minDigits?: number }) {
  const n = Number(raw ?? '0');
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return '0';
  const baseDigits = (tokenSymbol === 'BTC' || tokenSymbol === 'frBTC') ? 5 : 2;
  const minDigits = opts?.minDigits ?? 0;
  const fractionDigits = Math.max(baseDigits, minDigits);
  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${(Math.pow(10, -fractionDigits)).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
}

export default function RecentTradesPanel({ baseToken, quoteToken, poolId: poolIdProp, isWrapPair }: Props) {
  const { network } = useWallet() as { network: Network };
  const { data: poolsData, isLoading: isPoolsLoading } = usePools();

  // Prefer the pool ID provided by the swap shell (always reflects the active pair).
  // Fall back to looking it up from baseToken/quoteToken token IDs.
  const poolId = useMemo(() => {
    if (poolIdProp) return poolIdProp;
    if (!poolsData?.items || !baseToken || !quoteToken) return null;
    const pool = poolsData.items.find(p =>
      (p.token0.id === baseToken && p.token1.id === quoteToken) ||
      (p.token0.id === quoteToken && p.token1.id === baseToken)
    );
    return pool?.id || null;
  }, [poolIdProp, poolsData, baseToken, quoteToken]);

  const PAGE_SIZE = 30;

  // Pool swap history — used for AMM pairs (active when not in wrap mode)
  const swapQuery = useInfiniteQuery({
    queryKey: ['pool-swap-history', network, poolId],
    enabled: !isWrapPair && !!poolId && !!network,
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

  // Wrap/unwrap history — used when the swap shell is on a BTC↔frBTC wrap pair.
  // BTC↔frBTC has no AMM pool, so trades come from the global wrap/unwrap stream.
  // The endpoint returns both categories in one response (with item.type set);
  // the `category` param is not honored server-side, so calling per category
  // produces duplicates.
  // Pagination is keyed on the raw response size, not the filtered list — the
  // endpoint returns mixed transaction types and wraps/unwraps may be a small
  // fraction. Stopping when `filtered.length < PAGE_SIZE` would cut off scroll
  // after the first page.
  const wrapQuery = useInfiniteQuery({
    queryKey: ['wrap-unwrap-history', network],
    enabled: !!isWrapPair && !!network,
    staleTime: Infinity,
    initialPageParam: 0,
    getNextPageParam: (lastPage: { items: any[]; rawCount: number }, _all, lastPageParam: number) =>
      lastPage.rawCount >= PAGE_SIZE ? lastPageParam + PAGE_SIZE : undefined,
    queryFn: async ({ pageParam }) => {
      const rpcBase = `/api/rpc/${network || 'mainnet'}`;
      const resp = await fetch(`${rpcBase}/get-all-amm-tx-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ limit: PAGE_SIZE, offset: pageParam }),
      });
      if (!resp.ok) return { items: [], rawCount: 0 };
      const json = await resp.json();
      const items = json?.data?.items || json?.data || [];
      const list = Array.isArray(items) ? items : [];
      const wrapsAndUnwraps = list.filter(
        (it: any) => it?.type === 'wrap' || it?.type === 'unwrap'
      );
      const tsOf = (it: any) => {
        const ts = it.timestamp;
        if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000;
        const parsed = ts ? Date.parse(ts) : 0;
        return Number.isFinite(parsed) ? parsed : 0;
      };
      return {
        items: wrapsAndUnwraps.sort((a, b) => tsOf(b) - tsOf(a)),
        rawCount: list.length,
      };
    },
  });

  const { hasNextPage, fetchNextPage, isFetchingNextPage } = isWrapPair ? wrapQuery : swapQuery;

  const swapItems = useMemo(() => swapQuery.data?.pages?.flat() || [], [swapQuery.data]);
  const wrapItems = useMemo(
    () => wrapQuery.data?.pages?.flatMap((p) => p.items) || [],
    [wrapQuery.data]
  );

  // Get token names from pool data (only relevant for AMM pair view)
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
    const fmtTime = (ts: any) => {
      if (!ts) return '--:--:--';
      const ms = typeof ts === 'number' ? (ts > 1e12 ? ts : ts * 1000) : Date.parse(ts);
      if (!Number.isFinite(ms)) return '--:--:--';
      return new Date(ms).toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    };

    if (isWrapPair) {
      if (!wrapItems.length) return [];
      return wrapItems
        .filter((item: any) => {
          const raw = item.amount ?? item.value ?? '0';
          const n = Number(raw);
          return Number.isFinite(n) && n > 0;
        })
        .map((item: any, idx: number) => {
          const isWrap = item.type === 'wrap';
          const fromSymbol = isWrap ? 'BTC' : 'frBTC';
          const toSymbol = isWrap ? 'frBTC' : 'BTC';
          const fromId = isWrap ? 'btc' : '32:0';
          const toId = isWrap ? '32:0' : 'btc';
          const amount = item.amount || item.value || '0';
          return {
            id: `${item.transactionId || item.txid || 'wrap'}-${idx}`,
            soldFormatted: formatAmount(amount, 8, fromSymbol, { minDigits: 6 }),
            boughtFormatted: formatAmount(amount, 8, toSymbol, { minDigits: 6 }),
            fromSymbol,
            fromId,
            toSymbol,
            toId,
            type: isWrap ? 'Wrap' : 'Unwrap',
            time: fmtTime(item.timestamp),
          };
        });
    }

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

      return {
        id: `${item.transactionId || item.txid || item.transactionHash || 'trade'}-${idx}`,
        soldFormatted,
        boughtFormatted,
        fromSymbol,
        fromId,
        toSymbol,
        toId,
        type,
        time: fmtTime(item.timestamp),
      };
    });
  }, [isWrapPair, wrapItems, swapItems, pairPool]);

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

  // For wrap pairs, the underlying endpoint mixes all transaction types and
  // wraps/unwraps may be sparse — keep fetching pages until we have enough
  // rows to fill the container (or the source is exhausted). Without this,
  // the visible list is too short to trigger scroll-based pagination.
  useEffect(() => {
    if (!isWrapPair) return;
    if (!hasNextPage || isFetchingNextPage) return;
    if (trades.length < 20) {
      fetchNextPage();
    }
  }, [isWrapPair, trades.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const emptyMessage = isWrapPair
    ? 'No recent wraps or unwraps'
    : (!poolId && (isPoolsLoading || !poolsData) ? 'Loading...' : 'No recent trades for this pair');

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
            <span className="text-xs">{emptyMessage}</span>
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
