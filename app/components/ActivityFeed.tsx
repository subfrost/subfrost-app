'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
 
import { useInfiniteAmmTxHistory, AmmTransactionType } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import TokenIcon from '@/app/components/TokenIcon';
import Link from 'next/link';

type AmmRow =
  | ({ type: 'swap'; soldAmount: string; boughtAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; soldTokenBlockId: string; soldTokenTxId: string; boughtTokenBlockId: string; boughtTokenTxId: string; address?: string; sellerAddress?: string })
  | ({ type: 'mint'; token0Amount: string; token1Amount: string; lpTokenAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; minterAddress?: string })
  | ({ type: 'burn'; token0Amount: string; token1Amount: string; lpTokenAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; burnerAddress?: string })
  | ({ type: 'creation'; token0Amount: string; token1Amount: string; tokenSupply: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; creatorAddress?: string })
  | ({ type: 'wrap'; address?: string; transactionId: string; timestamp: string; amount: string })
  | ({ type: 'unwrap'; address?: string; transactionId: string; timestamp: string; amount: string });

function formatAmount(raw: string, decimals = 8, fractionDigits = 2) {
  const n = Number(raw ?? '0');
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return '0';
  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${(Math.pow(10, -fractionDigits)).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
}

function truncateAddress(addr: string, size = 6) {
  if (!addr) return '';
  if (addr.length <= size * 2 + 3) return addr;
  return `${addr.slice(0, size)}...${addr.slice(-size)}`;
}

function PairIcon({
  leftId,
  rightId,
  leftSymbol,
  rightSymbol,
}: {
  leftId?: string;
  rightId?: string;
  leftSymbol?: string;
  rightSymbol?: string;
}) {
  return (
    <div className="relative h-8 w-12">
      <div className="absolute left-0 top-0 h-8 w-8 rounded-full border border-white/20 bg-white/5">
        {/* TokenIcon expects network via WalletContext, handled app-wide */}
        <TokenIcon id={leftId} symbol={leftSymbol || (leftId ?? '')} size="md" />
      </div>
      <div className="absolute right-0 top-0 h-8 w-8 rounded-full border border-white/20 bg-white/5">
        <TokenIcon id={rightId} symbol={rightSymbol || (rightId ?? '')} size="md" />
      </div>
    </div>
  );
}

export default function ActivityFeed({ isFullPage = false, maxHeightClass }: { isFullPage?: boolean; maxHeightClass?: string }) {
  const [txFilter, setTxFilter] = useState<AmmTransactionType | 'all'>('all');
  const {
    data,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = useInfiniteAmmTxHistory({ count: 50, enabled: true, transactionType: txFilter === 'all' ? undefined : txFilter });

  const items: AmmRow[] = (data?.pages ?? []).flatMap((p) => (p.items as AmmRow[]));
  const tokenIds = useMemo(() => {
    const out = new Set<string>();
    items.forEach((row) => {
      if (row.type === 'swap') {
        out.add(`${row.soldTokenBlockId}:${row.soldTokenTxId}`);
        out.add(`${row.boughtTokenBlockId}:${row.boughtTokenTxId}`);
      } else if (row.type === 'mint' || row.type === 'burn' || row.type === 'creation') {
        const r: any = row;
        out.add(`${r.token0BlockId}:${r.token0TxId}`);
        out.add(`${r.token1BlockId}:${r.token1TxId}`);
      }
    });
    return Array.from(out);
  }, [items]);
  const { data: displayMap } = useTokenDisplayMap(tokenIds);

  const loadingRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = loadingRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      const first = entries[0];
      if (first && first.isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    }, { rootMargin: '200px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const getName = (id: string | undefined) => {
    if (!id) return '';
    const d = displayMap?.[id];
    return d?.symbol || d?.name || id;
  };

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-white/5">
      <div className="flex items-center justify-between px-4 py-3 gap-2">
        <h3 className="text-base font-semibold text-[color:var(--sf-text)]">Global Activity</h3>
        <div className="flex items-center gap-2">
          {!isFullPage && (
            <Link href="/activity" className="rounded-md border border-white/10 px-2 py-1 text-xs text-[color:var(--sf-primary)] hover:underline">
              View all
            </Link>
          )}
          <select
            className="rounded-md border border-white/20 bg-transparent px-2 py-1 text-sm text-[color:var(--sf-text)]"
            value={txFilter}
            onChange={(e) => setTxFilter(e.target.value as any)}
          >
            <option value="all">All</option>
            <option value="swap">Swaps</option>
            <option value="mint">Supply</option>
            <option value="burn">Withdraw</option>
            <option value="creation">Create Pool</option>
            <option value="wrap">Wrap</option>
            <option value="unwrap">Unwrap</option>
          </select>
        </div>
      </div>
      <div className="h-px w-full bg-white/10" />

      <div className={`no-scrollbar overflow-auto ${isFullPage ? 'max-h-[calc(100vh-200px)]' : (maxHeightClass ?? 'max-h-[70vh]')}`}>
        {/* Header */}
        <div className="grid grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] gap-4 px-4 py-2 text-xs text-[color:var(--sf-text)]/60">
          <div>Txn</div>
          <div>Pair</div>
          <div className="text-right">Amounts</div>
          <div className="text-right">Address</div>
          <div className="text-right">Time</div>
        </div>
        <div className="h-px w-full bg-white/10" />

        {/* Rows */}
        {items.map((row, idx) => {
          const time = new Date(row.timestamp);
          const timeLabel = new Intl.DateTimeFormat(undefined, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }).format(time);
          const address =
            (row as any).address ||
            (row as any).sellerAddress ||
            (row as any).minterAddress ||
            (row as any).burnerAddress ||
            (row as any).creatorAddress ||
            '';

          const typeLabel =
            row.type === 'swap' ? 'Swap' :
            row.type === 'mint' ? 'Supply' :
            row.type === 'burn' ? 'Withdraw' :
            row.type === 'creation' ? 'Create' :
            row.type === 'wrap' ? 'Wrap' : 'Unwrap';

          const pairNames = (() => {
            if (row.type === 'swap') {
              const leftId = `${row.soldTokenBlockId}:${row.soldTokenTxId}`;
              const rightId = `${row.boughtTokenBlockId}:${row.boughtTokenTxId}`;
              return {
                leftId, rightId,
                leftName: getName(leftId),
                rightName: getName(rightId),
              };
            } else if (row.type === 'mint' || row.type === 'burn' || row.type === 'creation') {
              const r: any = row;
              const leftId = `${r.token0BlockId}:${r.token0TxId}`;
              const rightId = `${r.token1BlockId}:${r.token1TxId}`;
              return {
                leftId, rightId,
                leftName: getName(leftId),
                rightName: getName(rightId),
              };
            } else {
              return {
                leftId: 'btc',
                rightId: 'frbtc',
                leftName: row.type === 'wrap' ? 'BTC' : 'frBTC',
                rightName: row.type === 'wrap' ? 'frBTC' : 'BTC',
              };
            }
          })();

          return (
            <Link
              key={(row as any).transactionId + '-' + idx}
              href={`https://ordiscan.com/tx/${(row as any).transactionId}`}
              target="_blank"
              className="grid grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] items-center gap-4 px-4 py-2 transition-colors hover:bg-white/5"
            >
              <div className="text-sm text-[color:var(--sf-text)]/80">{typeLabel}</div>

              <div className="flex items-center gap-3">
                <PairIcon
                  leftId={pairNames.leftId}
                  rightId={pairNames.rightId}
                  leftSymbol={pairNames.leftName}
                  rightSymbol={pairNames.rightName}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm text-[color:var(--sf-text)]">
                    {pairNames.leftName} · {pairNames.rightName}
                  </div>
                </div>
              </div>

              <div className="text-right font-mono text-xs text-[color:var(--sf-text)]">
                {row.type === 'swap' && (
                  <>
                    <div>- {formatAmount(row.soldAmount)} {pairNames.leftName}</div>
                    <div className="text-green-500">+ {formatAmount(row.boughtAmount)} {pairNames.rightName}</div>
                  </>
                )}
                {row.type === 'mint' && (
                  <>
                    <div>- {formatAmount((row as any).token0Amount)} {pairNames.leftName}</div>
                    <div>- {formatAmount((row as any).token1Amount)} {pairNames.rightName}</div>
                  </>
                )}
                {(row.type === 'burn' || row.type === 'creation') && (
                  <>
                    <div className="text-green-500">+ {formatAmount((row as any).token0Amount)} {pairNames.leftName}</div>
                    <div className="text-green-500">+ {formatAmount((row as any).token1Amount)} {pairNames.rightName}</div>
                  </>
                )}
                {row.type === 'wrap' && (
                  <>
                    <div>- {formatAmount((row as any).amount)} BTC</div>
                    <div className="text-green-500">+ {formatAmount((row as any).amount)} frBTC</div>
                  </>
                )}
                {row.type === 'unwrap' && (
                  <>
                    <div>- {formatAmount((row as any).amount)} frBTC</div>
                    <div className="text-green-500">+ {formatAmount((row as any).amount)} BTC</div>
                  </>
                )}
              </div>

              <div className="truncate text-right font-mono text-[10px] text-[color:var(--sf-text)]/60">{truncateAddress(address || '')}</div>
              <div className="text-right font-mono text-[10px] text-[color:var(--sf-text)]/60">{timeLabel}</div>
            </Link>
          );
        })}
        {(isLoading || isFetchingNextPage) && (
          <div className="px-4 py-3 text-center text-[color:var(--sf-text)]/60">Loading…</div>
        )}
        <div ref={loadingRef} className="h-6" />
      </div>
    </div>
  );
}


