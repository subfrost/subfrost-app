'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useInfiniteAmmTxHistory } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import TokenIcon from '@/app/components/TokenIcon';
import Link from 'next/link';
import { useWallet } from '@/context/WalletContext';
import { useTranslation } from '@/hooks/useTranslation';
import type { Network } from '@/utils/constants';

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

function PairIcon({
  leftId,
  rightId,
  leftSymbol,
  rightSymbol,
  network,
}: {
  leftId?: string;
  rightId?: string;
  leftSymbol?: string;
  rightSymbol?: string;
  network?: Network;
}) {
  return (
    <div className="relative h-8 w-12">
      <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[color:var(--sf-glass-border)] bg-transparent">
        <TokenIcon id={leftId} symbol={leftSymbol || (leftId ?? '')} size="lg" network={network} />
      </div>
      <div className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[color:var(--sf-glass-border)] bg-transparent">
        <TokenIcon id={rightId} symbol={rightSymbol || (rightId ?? '')} size="lg" network={network} />
      </div>
    </div>
  );
}

export default function MyWalletSwaps() {
  const { t } = useTranslation();
  const { address, network } = useWallet();
  
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

  // Include all transaction types (swap, mint, burn, creation, wrap, unwrap)
  const items: AmmRow[] = useMemo(() => {
    return (data?.pages ?? [])
      .flatMap((p) => (p.items as AmmRow[]));
  }, [data?.pages]);

  const tokenIds = useMemo(() => {
    const out = new Set<string>();
    items.forEach((row) => {
      if (row.type === 'swap') {
        out.add(`${row.soldTokenBlockId}:${row.soldTokenTxId}`);
        out.add(`${row.boughtTokenBlockId}:${row.boughtTokenTxId}`);
      } else if (row.type === 'mint' || row.type === 'burn' || row.type === 'creation') {
        const r: any = row;
        // Only add if we have the token IDs (enriched from pool metadata)
        if (r.token0BlockId && r.token0TxId) {
          out.add(`${r.token0BlockId}:${r.token0TxId}`);
        }
        if (r.token1BlockId && r.token1TxId) {
          out.add(`${r.token1BlockId}:${r.token1TxId}`);
        }
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

  // Known token ID to name mappings for fallback
  const KNOWN_TOKEN_NAMES: Record<string, string> = {
    '32:0': 'frBTC',
    '2:0': 'DIESEL',
    '2:56801': 'bUSD',
    'btc': 'BTC',
    'frbtc': 'frBTC',
  };

  const getName = (id: string | undefined) => {
    if (!id) return '';
    const d = displayMap?.[id];
    // Try displayMap first, then known tokens, then fall back to id
    return d?.symbol || d?.name || KNOWN_TOKEN_NAMES[id] || id;
  };

  // Determine if scrollbar is needed (more than 3 items)
  const hasScrollbar = items.length > 3;

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)] flex flex-col">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40 flex-shrink-0">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('myActivity.title')}</h3>
      </div>

      {!address ? (
        <div className="px-6 py-4 text-center text-sm text-[color:var(--sf-text)]/60 flex items-center justify-center min-h-[72px]">
          {t('myActivity.connectWallet')}
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
        <div className="grid grid-cols-[220px_1fr_minmax(100px,150px)] gap-4 px-6 py-4 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 border-b border-[color:var(--sf-row-border)] sticky top-0">
          <div>{t('myActivity.pair')}</div>
          <div className="text-right">{t('myActivity.amounts')}</div>
          <div className="text-right">{t('myActivity.time')}</div>
        </div>

        {/* Rows */}
        {items.length === 0 && !isLoading ? (
          <div className="px-6 py-12 text-center text-sm text-[color:var(--sf-text)]/60">
            {t('myActivity.noActivity')}
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

              const typeLabel =
                row.type === 'swap' ? t('myActivity.swap') :
                row.type === 'mint' ? t('myActivity.supply') :
                row.type === 'burn' ? t('myActivity.withdraw') :
                row.type === 'creation' ? t('myActivity.create') :
                row.type === 'wrap' ? t('myActivity.wrap') : t('myActivity.unwrap');

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
                  // Check if we have enriched token IDs from pool metadata
                  const hasTokenIds = r.token0BlockId && r.token0TxId && r.token1BlockId && r.token1TxId;
                  if (hasTokenIds) {
                    const leftId = `${r.token0BlockId}:${r.token0TxId}`;
                    const rightId = `${r.token1BlockId}:${r.token1TxId}`;
                    return {
                      leftId, rightId,
                      leftName: getName(leftId),
                      rightName: getName(rightId),
                    };
                  } else {
                    // Fallback to pool ID display while loading metadata
                    const poolId = `${r.poolBlockId}:${r.poolTxId}`;
                    return {
                      leftId: poolId,
                      rightId: poolId,
                      leftName: 'LP',
                      rightName: `Pool ${poolId}`,
                    };
                  }
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
                  href={`https://espo.sh/tx/${(row as any).transactionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="grid grid-cols-[220px_1fr_minmax(100px,150px)] items-center gap-4 px-6 py-4 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-row-border)] last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <PairIcon
                      leftId={pairNames.leftId}
                      rightId={pairNames.rightId}
                      leftSymbol={pairNames.leftName}
                      rightSymbol={pairNames.rightName}
                      network={network}
                    />
                    <div className="min-w-0">
                      <div className="text-xs text-[color:var(--sf-text)]/60 mb-0.5">{typeLabel}</div>
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

                  <div className="text-right text-xs text-[color:var(--sf-text)]">
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

                  <div className="text-right text-[10px] text-[color:var(--sf-text)]/60">{timeLabel}</div>
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
