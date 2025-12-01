'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteAmmTxHistory } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import TokenIcon from '@/app/components/TokenIcon';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';

type AmmRow =
  | ({ type: 'swap'; soldAmount: string; boughtAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; soldTokenBlockId: string; soldTokenTxId: string; boughtTokenBlockId: string; boughtTokenTxId: string; address?: string; sellerAddress?: string })
  | ({ type: 'wrap'; address?: string; transactionId: string; timestamp: string; amount: string })
  | ({ type: 'unwrap'; address?: string; transactionId: string; timestamp: string; amount: string });

function formatAmount(raw: string, decimals = 8, tokenSymbol?: string) {
  const n = Number(raw ?? '0');
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return '0';
  
  // Use 4 decimals for BTC/frBTC, 2 for other tokens
  const fractionDigits = (tokenSymbol === 'BTC' || tokenSymbol === 'frBTC') ? 4 : 2;
  
  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${(Math.pow(10, -fractionDigits)).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
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
      <div className="absolute left-0 top-0 h-8 w-8 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5">
        <TokenIcon id={leftId} symbol={leftSymbol || (leftId ?? '')} size="md" />
      </div>
      <div className="absolute right-0 top-0 h-8 w-8 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5">
        <TokenIcon id={rightId} symbol={rightSymbol || (rightId ?? '')} size="md" />
      </div>
    </div>
  );
}

export default function MyWalletSwaps() {
  const { address } = useWallet();
  
  const {
    data,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = useInfiniteAmmTxHistory({ 
    address, 
    count: 50, 
    enabled: !!address,
    transactionType: undefined // We'll filter client-side for swap, wrap, unwrap
  });

  // Filter to only show swap, wrap, and unwrap transactions
  const items: AmmRow[] = useMemo(() => {
    return (data?.pages ?? [])
      .flatMap((p) => (p.items as AmmRow[]))
      .filter((row) => row.type === 'swap' || row.type === 'wrap' || row.type === 'unwrap');
  }, [data?.pages]);

  const tokenIds = useMemo(() => {
    const out = new Set<string>();
    items.forEach((row) => {
      if (row.type === 'swap') {
        out.add(`${row.soldTokenBlockId}:${row.soldTokenTxId}`);
        out.add(`${row.boughtTokenBlockId}:${row.boughtTokenTxId}`);
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

  // Determine if scrollbar is needed (more than 3 items)
  const hasScrollbar = items.length > 3;

  return (
    <div className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)] flex flex-col">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40 flex-shrink-0">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">My Wallet Swaps</h3>
      </div>

      {!address ? (
        <div className="px-6 py-4 text-center text-sm text-[color:var(--sf-text)]/60 flex items-center justify-center min-h-[72px]">
          Connect your wallet to view your swap history
        </div>
      ) : (
        <>
          <div 
            className={`flex-1 ${hasScrollbar ? 'overflow-auto' : 'overflow-hidden'}`}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(40, 67, 114, 0.3) transparent'
            }}
          >
        {/* Header */}
        <div className="grid grid-cols-[220px_1fr_minmax(100px,150px)] gap-4 px-6 py-4 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 bg-[color:var(--sf-surface)]/40 border-b-2 border-[color:var(--sf-glass-border)] sticky top-0">
          <div>Pair</div>
          <div className="text-right">Amounts</div>
          <div className="text-right">Time</div>
        </div>

        {/* Rows */}
        {items.length === 0 && !isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
            No swap activity found for your wallet
          </div>
        ) : (
          <>
            {items.map((row, idx) => {
              const time = new Date(row.timestamp);
              const timeLabel = new Intl.DateTimeFormat(undefined, {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }).format(time);

              const pairNames = (() => {
                if (row.type === 'swap') {
                  const leftId = `${row.soldTokenBlockId}:${row.soldTokenTxId}`;
                  const rightId = `${row.boughtTokenBlockId}:${row.boughtTokenTxId}`;
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
                  rel="noopener noreferrer"
                  className="grid grid-cols-[220px_1fr_minmax(100px,150px)] items-center gap-4 px-6 py-4 transition-all hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)] last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <PairIcon
                      leftId={pairNames.leftId}
                      rightId={pairNames.rightId}
                      leftSymbol={pairNames.leftName}
                      rightSymbol={pairNames.rightName}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-[color:var(--sf-text)]">
                        {pairNames.leftName} → {pairNames.rightName}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs text-[color:var(--sf-text)]">
                    {row.type === 'swap' && (
                      <>
                        <div>- {formatAmount(row.soldAmount, 8, pairNames.leftName)} {pairNames.leftName}</div>
                        <div className="text-green-500">+ {formatAmount(row.boughtAmount, 8, pairNames.rightName)} {pairNames.rightName}</div>
                      </>
                    )}
                    {row.type === 'wrap' && (
                      <>
                        <div>- {formatAmount((row as any).amount, 8, 'BTC')} BTC</div>
                        <div className="text-green-500">+ {formatAmount((row as any).amount, 8, 'frBTC')} frBTC</div>
                      </>
                    )}
                    {row.type === 'unwrap' && (
                      <>
                        <div>- {formatAmount((row as any).amount, 8, 'frBTC')} frBTC</div>
                        <div className="text-green-500">+ {formatAmount((row as any).amount, 8, 'BTC')} BTC</div>
                      </>
                    )}
                  </div>

                  <div className="text-right font-mono text-[10px] text-[color:var(--sf-text)]/60">{timeLabel}</div>
                </Link>
              );
            })}
          </>
        )}
            {(isLoading || isFetchingNextPage) && (
              <div className="px-4 py-3 text-center text-[color:var(--sf-text)]/60">Loading…</div>
            )}
            <div ref={loadingRef} className="h-6" />
          </div>
        </>
      )}
    </div>
  );
}
