import { useState, useMemo } from "react";
import type { PoolSummary } from "../types";
import TokenIcon from "@/app/components/TokenIcon";
import { useWallet } from "@/context/WalletContext";

type Props = {
  pools: PoolSummary[];
  onSelect: (pool: PoolSummary) => void;
};

type SortField = 'pair' | 'tvl' | 'volume' | 'apr';
type SortOrder = 'asc' | 'desc';

export default function MarketsGrid({ pools, onSelect }: Props) {
  const { network } = useWallet();
  const [showAll, setShowAll] = useState(false);
  const [sortField, setSortField] = useState<SortField>('tvl');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const sortedPools = useMemo(() => {
    const sorted = [...pools].sort((a, b) => {
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
          aVal = a.vol24hUsd ?? 0;
          bVal = b.vol24hUsd ?? 0;
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
  }, [pools, sortField, sortOrder]);

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
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-2xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">Markets</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search pools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-64 rounded-lg border-2 border-[color:var(--sf-primary)]/20 bg-white pl-10 pr-4 text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 transition-all focus:border-[color:var(--sf-primary)]/50 focus:outline-none focus:ring-2 focus:ring-[color:var(--sf-primary)]/20"
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
          <div className="text-sm font-medium text-[color:var(--sf-text)]/60">
            {filteredPools.length} {filteredPools.length === 1 ? 'Pool' : 'Pools'}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredPools.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-[color:var(--sf-outline)] bg-white/50 backdrop-blur-sm p-12 text-center">
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
        <div className="hidden lg:block rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(40,67,114,0.12)]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[color:var(--sf-glass-border)] bg-white/40">
                <SortableHeader label="Pair" field="pair" currentField={sortField} sortOrder={sortOrder} onSort={handleSort} />
                <SortableHeader label="TVL" field="tvl" currentField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                <SortableHeader label="24h Volume" field="volume" currentField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                <SortableHeader label="APR" field="apr" currentField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right" />
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--sf-glass-border)]">
              {displayedPools.map((pool) => (
                <tr
                  key={pool.id}
                  className={`transition-all hover:bg-white/20 cursor-pointer group ${
                    selectedPoolId === pool.id ? 'bg-[color:var(--sf-primary)]/5 border-l-4 border-l-[color:var(--sf-primary)]' : ''
                  }`}
                  onClick={() => handleSelectPool(pool)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <div className="relative">
                          <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="lg" className="border-2 border-white shadow-sm" network={network} />
                        </div>
                        <div className="relative">
                          <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="lg" className="border-2 border-white shadow-sm" network={network} />
                        </div>
                      </div>
                      <span className="font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-colors">
                        {pool.pairLabel}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-semibold text-[color:var(--sf-text)]">
                        {formatUsd(pool.tvlUsd)}
                      </span>
                      <div className="flex items-center gap-1 w-24">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full flex">
                            <div 
                              className="h-full bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary)]/70"
                              style={{ width: '50%' }}
                              title={pool.token0.symbol}
                            />
                            <div 
                              className="h-full bg-gradient-to-r from-blue-400 to-blue-300"
                              style={{ width: '50%' }}
                              title={pool.token1.symbol}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-[color:var(--sf-text)]">
                    {formatUsd(pool.vol24hUsd)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">
                      {formatPercent(pool.apr)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPool(pool);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-xs font-bold text-white uppercase tracking-wide transition-all hover:bg-[color:var(--sf-primary-pressed)] hover:shadow-lg opacity-0 group-hover:opacity-100"
                    >
                      Trade
                    </button>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
        {displayedPools.map((pool) => (
          <button
            key={pool.id}
            onClick={() => handleSelectPool(pool)}
            className={`text-left rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 backdrop-blur-md transition-all hover:shadow-[0_8px_24px_rgba(40,67,114,0.15)] hover:border-[color:var(--sf-primary)]/40 hover:bg-white/20 sf-focus-ring ${
              selectedPoolId === pool.id ? 'ring-2 ring-[color:var(--sf-primary)] border-[color:var(--sf-primary)]' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} iconUrl={pool.token0.iconUrl} size="md" className="border-2 border-white shadow-sm" network={network} />
                  <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} iconUrl={pool.token1.iconUrl} size="md" className="border-2 border-white shadow-sm" network={network} />
                </div>
                <span className="font-bold text-[color:var(--sf-text)]">{pool.pairLabel}</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                {formatPercent(pool.apr)}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">TVL</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(pool.tvlUsd)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">24h Volume</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(pool.vol24hUsd)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div 
                      className="h-full bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary)]/70"
                      style={{ width: '50%' }}
                    />
                    <div 
                      className="h-full bg-gradient-to-r from-blue-400 to-blue-300"
                      style={{ width: '50%' }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-[color:var(--sf-text)]/60">
                  <span>50/50</span>
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
            className="rounded-xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-8 py-3 font-bold text-[color:var(--sf-text)] uppercase tracking-wide backdrop-blur-md transition-all hover:bg-white/30 hover:shadow-lg hover:border-[color:var(--sf-primary)]/40 sf-focus-ring"
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
  align?: 'left' | 'right';
}) {
  const isActive = currentField === field;
  const alignClass = align === 'right' ? 'text-right justify-end' : 'text-left justify-start';

  return (
    <th className={`px-6 py-4 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-2 font-bold uppercase tracking-wider text-xs transition-colors sf-focus-ring ${alignClass} ${
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

function formatUsd(v?: number) {
  if (v == null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function formatPercent(v?: number) {
  if (v == null) return "-";
  return `${v.toFixed(2)}%`;
}


