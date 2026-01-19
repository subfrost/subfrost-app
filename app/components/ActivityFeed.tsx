'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { useInfiniteAmmTxHistory, AmmTransactionType } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import { useWallet } from '@/context/WalletContext';
import TokenIcon from '@/app/components/TokenIcon';
import Link from 'next/link';

const TX_FILTER_OPTIONS: { value: AmmTransactionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'swap', label: 'Swaps' },
  { value: 'mint', label: 'Supply' },
  { value: 'burn', label: 'Withdraw' },
  { value: 'creation', label: 'Create Pool' },
  { value: 'wrap', label: 'Wrap' },
  { value: 'unwrap', label: 'Unwrap' },
];

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

function truncateAddress(addr: string, prefixSize = 6, suffixSize?: number) {
  if (!addr) return '';
  const suffix = suffixSize ?? prefixSize;
  if (addr.length <= prefixSize + suffix + 3) return addr;
  return `${addr.slice(0, prefixSize)}...${addr.slice(-suffix)}`;
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
      <div className="absolute left-0 top-0 h-8 w-8 rounded-full bg-transparent flex items-center justify-center overflow-hidden">
        {/* TokenIcon expects network via WalletContext, handled app-wide */}
        <TokenIcon id={leftId} symbol={leftSymbol || (leftId ?? '')} size="md" />
      </div>
      <div className="absolute right-0 top-0 h-8 w-8 rounded-full bg-transparent flex items-center justify-center overflow-hidden">
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
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
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

  // Close filter dropdown on click outside
  useEffect(() => {
    if (!filterDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [filterDropdownOpen]);

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
    return d?.name || d?.symbol || KNOWN_TOKEN_NAMES[id] || id;
  };

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-[color:var(--sf-text)]">Global Activity</h3>
            <div className="relative" ref={filterDropdownRef}>
              <button
                type="button"
                onClick={() => setFilterDropdownOpen((v) => !v)}
                className="flex items-center gap-1 rounded-md bg-transparent px-2 py-1 text-sm text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
              >
                {TX_FILTER_OPTIONS.find((o) => o.value === txFilter)?.label ?? 'All Types'}
                <ChevronDown size={14} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${filterDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {filterDropdownOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                  {TX_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTxFilter(option.value);
                        setFilterDropdownOpen(false);
                      }}
                      className={`w-full px-4 py-1.5 text-left text-sm font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                        txFilter === option.value
                          ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                          : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {!isFullPage ? (
            <Link href="/activity" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
              View all
            </Link>
          ) : (
            <Link href="/" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
              Back
            </Link>
          )}
        </div>
      </div>

      {/* Column Headers */}
      {/* Mobile header (xs only) - 3 columns */}
      <div className="sm:hidden grid grid-cols-[auto_1fr_auto] gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 border-b border-[color:var(--sf-row-border)]">
        <div>Txn</div>
        <div className="text-center">Pair</div>
        <div className="text-right">Amounts</div>
      </div>
      {/* Desktop header (sm+) - 5 columns */}
      <div className="hidden sm:grid sm:grid-cols-[minmax(60px,0.8fr)_minmax(120px,1.2fr)_minmax(100px,1.2fr)_minmax(80px,1fr)_minmax(70px,0.8fr)] lg:grid-cols-[minmax(80px,1fr)_minmax(160px,1.5fr)_minmax(120px,1.2fr)_minmax(90px,1fr)_minmax(80px,1fr)] xl:grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] gap-2 lg:gap-3 xl:gap-4 px-6 py-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70 border-b border-[color:var(--sf-row-border)]">
        <div>Txn</div>
        <div>Pair</div>
        <div className="text-right">Amounts</div>
        <div className="text-right">Address</div>
        <div className="text-right">Time</div>
      </div>

      <div className={`no-scrollbar overflow-auto ${isFullPage ? 'max-h-[calc(100vh-200px)]' : (maxHeightClass ?? 'max-h-[70vh]')}`}>
        <div className="sm:min-w-fit">
          {/* Rows */}
          {items.map((row, idx) => {
          const time = new Date(row.timestamp);
          const timeLabel = new Intl.DateTimeFormat(undefined, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }).format(time);
          // Separate date and time for responsive display
          const dateLabel = new Intl.DateTimeFormat(undefined, {
            month: '2-digit',
            day: '2-digit',
          }).format(time);
          const hourMinLabel = new Intl.DateTimeFormat(undefined, {
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
              className="block px-6 py-4 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-primary)]/10 border-b border-[color:var(--sf-row-border)]"
            >
              {/* Mobile layout (xs only) - 2 rows */}
              <div className="sm:hidden">
                {/* Row 1: Txn, Pair, Amounts */}
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                  <div className="text-sm text-[color:var(--sf-text)]/80">{typeLabel}</div>

                  <div className="flex items-center justify-center gap-2">
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
                </div>

                {/* Row 2: Address (left) and Date (right) */}
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-[color:var(--sf-row-border)]/50">
                  <div className="text-xs text-[color:var(--sf-text)]/50">{truncateAddress(address || '', 6, 4)}</div>
                  <div className="text-xs text-[color:var(--sf-text)]/50">{timeLabel}</div>
                </div>
              </div>

              {/* Desktop layout (sm+) - single row with 5 columns */}
              <div className="hidden sm:grid sm:grid-cols-[minmax(60px,0.8fr)_minmax(120px,1.2fr)_minmax(100px,1.2fr)_minmax(80px,1fr)_minmax(70px,0.8fr)] lg:grid-cols-[minmax(80px,1fr)_minmax(160px,1.5fr)_minmax(120px,1.2fr)_minmax(90px,1fr)_minmax(80px,1fr)] xl:grid-cols-[minmax(100px,1fr)_220px_150px_minmax(90px,1fr)_minmax(80px,1fr)] items-center gap-2 lg:gap-3 xl:gap-4">
                <div className="text-sm text-[color:var(--sf-text)]/80">{typeLabel}</div>

                <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-3">
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

                <div className="truncate text-right text-sm text-[color:var(--sf-text)]/60">
                  <span className="lg:hidden">{truncateAddress(address || '', 5, 3)}</span>
                  <span className="hidden lg:inline">{truncateAddress(address || '')}</span>
                </div>
                <div className="text-right text-sm text-[color:var(--sf-text)]/60">
                  <span className="lg:hidden">{dateLabel}</span>
                  <span className="hidden lg:inline">{timeLabel}</span>
                </div>
              </div>
            </Link>
          );
        })}
          {(isLoading || isFetchingNextPage) && (
            <div className="px-4 py-3 text-center text-[color:var(--sf-text)]/60">Loading…</div>
          )}
          <div ref={loadingRef} className="h-6" />
        </div>
      </div>
    </div>
  );
}


