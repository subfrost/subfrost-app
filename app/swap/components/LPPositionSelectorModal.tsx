'use client';

import { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import type { LPPosition } from './LiquidityInputs';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  positions: LPPosition[];
  onSelectPosition: (position: LPPosition) => void;
  selectedPositionId?: string;
};

export default function LPPositionSelectorModal({
  isOpen,
  onClose,
  positions,
  onSelectPosition,
  selectedPositionId,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPositions = useMemo(() => {
    if (!searchQuery.trim()) return positions;
    const query = searchQuery.toLowerCase();
    return positions.filter((position) => {
      return (
        position.token0Symbol.toLowerCase().includes(query) ||
        position.token1Symbol.toLowerCase().includes(query)
      );
    });
  }, [positions, searchQuery]);

  const handleSelect = (position: LPPosition) => {
    onSelectPosition(position);
    onClose();
    setSearchQuery('');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] max-h-[600px] w-full max-w-[480px] flex-col overflow-hidden rounded-3xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40 px-6 py-5">
          <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
            Select LP Position
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/80 text-[color:var(--sf-text)]/70 transition-all hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/30 focus:outline-none"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/20 px-6 py-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40"
            />
            <input
              type="text"
              placeholder="Search positions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 py-3 pl-10 pr-4 text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:border-[color:var(--sf-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--sf-primary)]/50 transition-all"
            />
          </div>
        </div>

        {/* Position List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {filteredPositions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-medium text-[color:var(--sf-text)]/50">
                No LP positions found
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredPositions.map((position) => {
                const isSelected = position.id === selectedPositionId;

                return (
                  <button
                    key={position.id}
                    onClick={() => handleSelect(position)}
                    className={`group w-full rounded-xl border-2 p-4 text-left transition-all hover:shadow-md focus:outline-none ${
                      isSelected
                        ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10'
                        : 'border-transparent bg-[color:var(--sf-surface)]/40 hover:border-[color:var(--sf-primary)]/30 hover:bg-[color:var(--sf-surface)]/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-colors">
                            {position.token0Symbol}/{position.token1Symbol}
                          </span>
                          {isSelected && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--sf-primary)] text-white">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-[color:var(--sf-text)]/60 truncate">
                          LP Position
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-sm font-bold text-[color:var(--sf-text)]">
                          {position.amount}
                        </span>
                        <span className="text-xs font-medium text-[color:var(--sf-text)]/50">
                          ${position.valueUSD}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
