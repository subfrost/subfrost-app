import { useState, useMemo } from "react";
import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";
import { useBtcPrice } from "@/hooks/useBtcPrice";

type Props = {
  pools: PoolSummary[];
  onSelect: (pool: PoolSummary) => void;
};

type SortField = 'pair' | 'tvl' | 'volume' | 'apr';
type SortOrder = 'asc' | 'desc';

type MarketFilter = 'all' | 'btc' | 'usd';
type VolumePeriod = '24h' | '30d';
type CurrencyDisplay = 'usd' | 'btc';

export default function MarketsGrid({ pools, onSelect }: Props) {
  const { network } = useWallet();
  const { data: btcPrice } = useBtcPrice();
  const [showAll, setShowAll] = useState(false);
  const [sortField, setSortField] = useState<SortField>('tvl');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [volumePeriod, setVolumePeriod] = useState<VolumePeriod>('24h');
  const [currencyDisplay, setCurrencyDisplay] = useState<CurrencyDisplay>('usd');

  // Whitelisted pool IDs (mainnet-specific)
  // On non-mainnet networks, allow all pools
  const whitelistedPoolIds = useMemo(() => {
    if (network !== 'mainnet') {
      return null; // Allow all pools on non-mainnet
    }
    return new Set([
      '2:77222',
      '2:77087',
      '2:77221',
      '2:77228',
      '2:77237',
      '2:68441',
      '2:68433',
    ]);
  }, [network]);

  const sortedPools = useMemo(() => {
    let filtered = whitelistedPoolIds === null
      ? pools
      : pools.filter(pool => whitelistedPoolIds.has(pool.id));
    
    // Apply market filter
    if (marketFilter === 'btc') {
      filtered = filtered.filter(pool => 
        pool.pairLabel.includes('frBTC')
      );
    } else if (marketFilter === 'usd') {
      filtered = filtered.filter(pool => 
        pool.pairLabel.includes('bUSD')
      );
    }
    
    const sorted = [...filtered].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'pair':
          aVal = a.pairLabel.toLowerCase();
          bVal = b.pairLabel.toLowerCase();
          break;
        case 'tvl':
          aVal = a.tvlUsd ?? 0;
          bVal = b.tvlUsd ?? 0;
          break;
        case 'volume':
          // Use the appropriate volume field based on selected period
          if (volumePeriod === '24h') {
            aVal = a.vol24hUsd ?? 0;
            bVal = b.vol24hUsd ?? 0;
          } else {
            aVal = a.vol30dUsd ?? 0;
            bVal = b.vol30dUsd ?? 0;
          }
          break;
        case 'apr':
          aVal = a.apr ?? 0;
          bVal = b.apr ?? 0;
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortOrder === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return sorted;
  }, [pools, sortField, sortOrder, whitelistedPoolIds, marketFilter, volumePeriod]);

  // Filter pools based on search query
  const filteredPools = useMemo(() => {
    if (!searchQuery.trim()) return sortedPools;
    
    const query = searchQuery.toLowerCase();
    return sortedPools.filter(pool => 
      pool.pairLabel.toLowerCase().includes(query) ||
      pool.token0.symbol.toLowerCase().includes(query) ||
      pool.token1.symbol.toLowerCase().includes(query) ||
      pool.token0.id.toLowerCase().includes(query) ||
      pool.token1.id.toLowerCase().includes(query)
    );
  }, [sortedPools, searchQuery]);

  const displayedPools = showAll ? filteredPools : filteredPools.slice(0, 12);
  const hasMore = filteredPools.length > 12;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleSelectPool = (pool: PoolSummary) => {
    setSelectedPoolId(pool.id);
    onSelect(pool);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setMarketFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all border-2 ${
              marketFilter === 'all'
                ? 'bg-[color:var(--sf-primary)] text-white shadow-lg border-transparent'
                : 'bg-[color:var(--sf-surface)]/60 text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]/80 border-[color:var(--sf-glass-border)]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setMarketFilter('btc')}
            className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all border-2 ${
              marketFilter === 'btc'
                ? 'bg-[color:var(--sf-primary)] text-white shadow-lg border-transparent'
                : 'bg-[color:var(--sf-surface)]/60 text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]/80 border-[color:var(--sf-glass-border)]'
            }`}
          >
            BTC
          </button>
          <button
            onClick={() => setMarketFilter('usd')}
            className={`rounded-lg px-4 py-2 text-sm font-bold uppercase tracking-wide transition-all border-2 ${
              marketFilter === 'usd'
                ? 'bg-[color:var(--sf-primary)] text-white shadow-lg border-transparent'
                : 'bg-[color:var(--sf-surface)]/60 text-[color:var(--sf-text)] hover:bg-[color:var(--sf-surface)]/80 border-[color:var(--sf-glass-border)]'
            }`}
          >
            USD
          </button>
        </div>
        <div className="flex items-center gap-3 min-w-0 flex-1 justify-end">
          <div className="relative w-full max-w-xs">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="hidden md:block lg:hidden h-10 w-full rounded-lg border-2 border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] pl-10 pr-4 text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 transition-all focus:border-[color:var(--sf-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[color:var(--sf-primary)]/20"
            />
            <input
              type="text"
              placeholder="Search pools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="md:hidden lg:block h-10 w-full rounded-lg border-2 border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] pl-10 pr-4 text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 transition-all focus:border-[color:var(--sf-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[color:var(--sf-primary)]/20"
            />
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--sf-text)]/40"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)] transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredPools.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/50 backdrop-blur-sm p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-[color:var(--sf-text)]/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-2">No pools found</h3>
          <p className="text-sm text-[color:var(--sf-text)]/60">
            {searchQuery ? `No pools match "${searchQuery}"` : 'No pools available'}
          </p>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 text-sm font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-colors"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      {filteredPools.length > 0 && (
        <div className="hidden md:block rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)]">
        <div className="px-4 py-4 border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-[color:var(--sf-text)]">Markets</h3>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrencyDisplay('usd')}
                  className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                    currencyDisplay === 'usd' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                  }`}
                >
                  $
                </button>
                <span className="text-[color:var(--sf-text)]/30">|</span>
                <button
                  onClick={() => setCurrencyDisplay('btc')}
                  className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                    currencyDisplay === 'btc' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                  }`}
                >
                  ₿
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setVolumePeriod('24h')}
                  className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                    volumePeriod === '24h' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                  }`}
                >
                  24H
                </button>
                <span className="text-[color:var(--sf-text)]/30">|</span>
                <button
                  onClick={() => setVolumePeriod('30d')}
                  className={`text-xs font-bold uppercase tracking-wider transition-colors ${
                    volumePeriod === '30d' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                  }`}
                >
                  30D
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[35%]" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead>
              <tr className="border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40">
                <th className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">LP Pair</th>
                <th className="px-2 py-3 text-right">
                  <button
                    onClick={() => handleSort('tvl')}
                    className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-xs transition-colors ${
                      sortField === 'tvl' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]'
                    }`}
                  >
                    <span>TVL</span>
                    <span className={`transition-all ${sortField === 'tvl' ? 'opacity-100' : 'opacity-30'}`}>
                      {sortField === 'tvl' && sortOrder === 'desc' ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                  </button>
                </th>
                <th className="px-2 py-3 text-right">
                  <button
                    onClick={() => handleSort('volume')}
                    className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-xs transition-colors ${
                      sortField === 'volume' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]'
                    }`}
                  >
                    <span>VOL</span>
                    <span className={`transition-all ${sortField === 'volume' ? 'opacity-100' : 'opacity-30'}`}>
                      {sortField === 'volume' && sortOrder === 'desc' ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </span>
                  </button>
                </th>
                <SortableHeader label="APY" field="apr" currentField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--sf-glass-border)]">
              {displayedPools.map((pool) => (
                <tr
                  key={pool.id}
                  className={`transition-all hover:bg-[color:var(--sf-primary)]/10 cursor-pointer group ${
                    selectedPoolId === pool.id ? 'bg-[color:var(--sf-primary)]/5 border-l-4 border-l-[color:var(--sf-primary)]' : ''
                  }`}
                  onClick={() => handleSelectPool(pool)}
                >
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex -space-x-2">
                        <div className="relative">
                          <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="xl" network={network} />
                        </div>
                        <div className="relative">
                          <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="xl" network={network} />
                        </div>
                      </div>
                      <span className="text-xs font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-colors whitespace-nowrap overflow-hidden text-ellipsis w-full text-center">
                        {pool.pairLabel.replace(/ LP$/, '')}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className="text-xs font-semibold text-[color:var(--sf-text)]">
                      {formatCurrency(pool.tvlUsd, currencyDisplay, btcPrice)}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right text-xs font-semibold text-[color:var(--sf-text)]">
                    {volumePeriod === '24h' && formatCurrency(pool.vol24hUsd, currencyDisplay, btcPrice, true)}
                    {volumePeriod === '30d' && formatCurrency(pool.vol30dUsd, currencyDisplay, btcPrice, true)}
                  </td>
                  <td className="px-2 py-3 text-center">
                    <span className="inline-flex items-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)]">
                      {formatPercent(pool.apr)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Mobile/Tablet Card View */}
      {filteredPools.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:hidden">
        {displayedPools.map((pool) => (
          <button
            key={pool.id}
            onClick={() => handleSelectPool(pool)}
            className={`text-left rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 backdrop-blur-md transition-all hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:border-[color:var(--sf-primary)]/40 hover:bg-[color:var(--sf-primary)]/10 focus:outline-none ${
              selectedPoolId === pool.id ? 'ring-2 ring-[color:var(--sf-primary)] border-[color:var(--sf-primary)]' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="lg" network={network} />
                  <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="lg" network={network} />
                </div>
                <span className="text-sm font-bold text-[color:var(--sf-text)]">{pool.pairLabel.replace(/ LP$/, '')}</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2.5 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)]">
                {formatPercent(pool.apr)}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">TVL</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatCurrency(pool.tvlUsd, currencyDisplay, btcPrice)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">24h Volume</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatCurrency(pool.vol24hUsd, currencyDisplay, btcPrice, true)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-[color:var(--sf-outline)] rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div 
                      className="h-full bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary)]/70"
                      style={{ width: `${getToken0Percentage(pool)}%` }}
                    />
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-300"
                      style={{ width: `${getToken1Percentage(pool)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-[color:var(--sf-text)]/60">
                  <span>{getToken0Percentage(pool).toFixed(1)}/{getToken1Percentage(pool).toFixed(1)}</span>
                </div>
              </div>
            </div>
          </button>
        ))}
        </div>
      )}

      {hasMore && !showAll && filteredPools.length > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowAll(true)}
            className="rounded-xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-8 py-3 font-bold text-[color:var(--sf-text)] uppercase tracking-wide backdrop-blur-md transition-all hover:bg-[color:var(--sf-primary)]/15 hover:shadow-lg hover:border-[color:var(--sf-primary)]/40 focus:outline-none"
          >
            Show All Pools ({filteredPools.length - displayedPools.length} more)
          </button>
        </div>
      )}
    </div>
  );
}

function SortableHeader({
  label,
  field,
  currentField,
  sortOrder,
  onSort,
  align = 'left',
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const isActive = currentField === field;
  const alignClass = 
    align === 'right' ? 'text-right justify-end' : 
    align === 'center' ? 'text-center justify-center' : 
    'text-left justify-start';
  const thAlignClass = 
    align === 'right' ? 'text-right' : 
    align === 'center' ? 'text-center' : 
    'text-left';

  return (
    <th className={`px-2 py-3 ${thAlignClass}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider text-xs transition-colors outline-none ${alignClass} ${
          isActive ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)]'
        }`}
      >
        <span>{label}</span>
        <span className={`transition-all ${isActive ? 'opacity-100' : 'opacity-30'}`}>
          {isActive && sortOrder === 'desc' ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </span>
      </button>
    </th>
  );
}

function formatCurrency(v?: number, currency: CurrencyDisplay = 'usd', btcPrice?: number, showZeroAsDash = false) {
  if (v == null || (showZeroAsDash && v === 0)) return "-";

  if (currency === 'btc') {
    if (!btcPrice || btcPrice === 0) return "-";
    const btcValue = v / btcPrice;
    return `₿${btcValue.toFixed(4)}`;
  }

  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatPercent(v?: number) {
  if (v == null) return "-";
  return `${v.toFixed(2)}%`;
}

function getToken0Percentage(pool: PoolSummary): number {
  if (!pool.token0TvlUsd || !pool.token1TvlUsd) return 50;
  const total = pool.token0TvlUsd + pool.token1TvlUsd;
  if (total === 0) return 50;
  return (pool.token0TvlUsd / total) * 100;
}

function getToken1Percentage(pool: PoolSummary): number {
  if (!pool.token0TvlUsd || !pool.token1TvlUsd) return 50;
  const total = pool.token0TvlUsd + pool.token1TvlUsd;
  if (total === 0) return 50;
  return (pool.token1TvlUsd / total) * 100;
}


