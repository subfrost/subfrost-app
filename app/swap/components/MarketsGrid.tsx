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

  const displayedPools = showAll ? sortedPools : sortedPools.slice(0, 12);
  const hasMore = sortedPools.length > 12;

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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">Markets</h2>
        <div className="text-sm font-medium text-[color:var(--sf-text)]/60">
          {sortedPools.length} {sortedPools.length === 1 ? 'Pool' : 'Pools'}
        </div>
      </div>

      {/* Desktop Table View */}
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
                          <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} size="lg" className="border-2 border-white shadow-sm" network={network} />
                        </div>
                        <div className="relative">
                          <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} size="lg" className="border-2 border-white shadow-sm" network={network} />
                        </div>
                      </div>
                      <span className="font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-colors">
                        {pool.pairLabel}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-semibold text-[color:var(--sf-text)]">
                    {formatUsd(pool.tvlUsd)}
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

      {/* Mobile/Tablet Card View */}
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
                  <TokenIcon symbol={pool.token0.symbol} id={pool.token0.id} size="md" className="border-2 border-white shadow-sm" network={network} />
                  <TokenIcon symbol={pool.token1.symbol} id={pool.token1.id} size="md" className="border-2 border-white shadow-sm" network={network} />
                </div>
                <span className="font-bold text-[color:var(--sf-text)]">{pool.pairLabel}</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">
                {formatPercent(pool.apr)}
              </span>
            </div>
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
          </button>
        ))}
      </div>

      {hasMore && !showAll && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setShowAll(true)}
            className="rounded-xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-8 py-3 font-bold text-[color:var(--sf-text)] uppercase tracking-wide backdrop-blur-md transition-all hover:bg-white/30 hover:shadow-lg hover:border-[color:var(--sf-primary)]/40 sf-focus-ring"
          >
            Show All Pools ({sortedPools.length - displayedPools.length} more)
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


