'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { useInfiniteAmmTxHistory, AmmTransactionType } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import { useWallet } from '@/context/WalletContext';
import TokenIcon from '@/app/components/TokenIcon';
import Link from 'next/link';

type AmmRow =
  | ({ type: 'swap'; soldAmount: string; boughtAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; soldTokenBlockId: string; soldTokenTxId: string; boughtTokenBlockId: string; boughtTokenTxId: string; address?: string; sellerAddress?: string })
  | ({ type: 'mint'; token0Amount: string; token1Amount: string; lpTokenAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; minterAddress?: string })
  | ({ type: 'burn'; token0Amount: string; token1Amount: string; lpTokenAmount: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; burnerAddress?: string })
  | ({ type: 'creation'; token0Amount: string; token1Amount: string; tokenSupply: string; poolBlockId: string; poolTxId: string; timestamp: string; transactionId: string; token0BlockId: string; token0TxId: string; token1BlockId: string; token1TxId: string; address?: string; creatorAddress?: string })
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
      <div className="absolute left-0 top-0 h-8 w-8 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5">
        {/* TokenIcon expects network via WalletContext, handled app-wide */}
        <TokenIcon id={leftId} symbol={leftSymbol || (leftId ?? '')} size="md" />
      </div>
      <div className="absolute right-0 top-0 h-8 w-8 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5">
        <TokenIcon id={rightId} symbol={rightSymbol || (rightId ?? '')} size="md" />
      </div>
    </div>
  );
}

// Whitelisted pool IDs (mainnet only)
const MAINNET_WHITELISTED_POOL_IDS = new Set([
  '2:77222',
  '2:77087',
  '2:77221',
  '2:77228',
  '2:77237',
  '2:68441',
  '2:68433',
]);

export default function ActivityFeed({ isFullPage = false, maxHeightClass }: { isFullPage?: boolean; maxHeightClass?: string }) {
  const { network } = useWallet();
  const [txFilter, setTxFilter] = useState<AmmTransactionType | 'all'>('all');
  const {
    data,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
    isLoading,
  } = useInfiniteAmmTxHistory({ count: 50, enabled: true, transactionType: txFilter === 'all' ? undefined : txFilter });

  // Filter items to only show transactions from whitelisted pools (mainnet only)
  const allItems: AmmRow[] = (data?.pages ?? []).flatMap((p) => (p.items as AmmRow[]));
  const items = useMemo(() => {
    return allItems.filter((row) => {
      // Wrap/unwrap transactions are always allowed (no pool)
      if (row.type === 'wrap' || row.type === 'unwrap') {
        return true;
      }
      // On non-mainnet, allow all pool transactions
      if (network !== 'mainnet') {
        return true;
      }
      // For pool-based transactions on mainnet, check if the pool is whitelisted
      const poolId = `${row.poolBlockId}:${row.poolTxId}`;
      return MAINNET_WHITELISTED_POOL_IDS.has(poolId);
    });
  }, [allItems, network]);
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
    return d?.name || d?.symbol || id;
  };

  return (
    <div className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[color:var(--sf-text)]">Global Activity</h3>
            <select
              className="rounded-md border border-[color:var(--sf-glass-border)] bg-transparent px-2 py-1 text-sm text-[color:var(--sf-text)]"
              value={txFilter}
              onChange={(e) => setTxFilter(e.target.value as any)}
            >
              <option value="all">All Types</option>
              <option value="swap">Swaps</option>
              <option value="mint">Supply</option>
              <option value="burn">Withdraw</option>
              <option value="creation">Create Pool</option>
              <option value="wrap">Wrap</option>
              <option value="unwrap">Unwrap</option>
            </select>
          </div>
          {!isFullPage ? (
            <Link href="/activity" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-colors">
              View all
            </Link>
          ) : (
            <Link href="/" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-colors">
              Back
            </Link>
          )}
        </div>
      </div>

      <div className={`no-scrollbar overflow-auto ${isFullPage ? 'max-h-[calc(100vh-200px)]' : (maxHeightClass ?? 'max-h-[70vh]')}`}>
        {/* Header */}
        <div className="grid grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] gap-4 px-6 py-4 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 bg-[color:var(--sf-surface)]/40 border-b-2 border-[color:var(--sf-glass-border)] min-w-fit">
          <div>Txn</div>
          <div>Pair</div>
          <div className="text-right">Amounts</div>
          <div className="text-right">Address</div>
          <div className="text-right">Time</div>
        </div>

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
              className="grid grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] items-center gap-4 px-6 py-4 transition-all hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-glass-border)] last:border-b-0"
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
                    {(row.type === 'mint' || row.type === 'burn') 
                      ? `${pairNames.leftName} / ${pairNames.rightName}`
                      : (row.type === 'wrap' || row.type === 'unwrap' || row.type === 'swap')
                      ? `${pairNames.leftName} → ${pairNames.rightName}`
                      : `${pairNames.leftName} · ${pairNames.rightName}`
                    }
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
                {row.type === 'mint' && (
                  <>
                    <div>- {formatAmount((row as any).token0Amount, 8, pairNames.leftName)} {pairNames.leftName}</div>
                    <div>- {formatAmount((row as any).token1Amount, 8, pairNames.rightName)} {pairNames.rightName}</div>
                  </>
                )}
                {(row.type === 'burn' || row.type === 'creation') && (
                  <>
                    <div className="text-green-500">+ {formatAmount((row as any).token0Amount, 8, pairNames.leftName)} {pairNames.leftName}</div>
                    <div className="text-green-500">+ {formatAmount((row as any).token1Amount, 8, pairNames.rightName)} {pairNames.rightName}</div>
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


