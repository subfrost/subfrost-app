'use client';

import { useState, useMemo } from 'react';
import { X, Search } from 'lucide-react';
import type { LPPosition } from './LiquidityInputs';
import { useTranslation } from '@/hooks/useTranslation';
import { useWallet } from '@/context/WalletContext';
import TokenIcon from '@/app/components/TokenIcon';

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
  const { t } = useTranslation();
  const { network } = useWallet();
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
    <div className="sf-popup-overlay px-4" onClick={onClose}>
      <div
        className="sf-popup w-full max-w-[480px] h-[80vh] max-h-[600px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sf-popup-header flex items-center justify-between px-6 py-5">
          <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
            {t('lpSelector.title')}
          </h2>
          <button
            onClick={onClose}
            className="sf-popup-close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-4">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40"
            />
            <input
              type="text"
              placeholder={t('lpSelector.searchPositions')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] py-3 pl-10 pr-4 shadow-[0_2px_12px_rgba(0,0,0,0.08)] text-sm font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
            />
          </div>
        </div>

        {/* Position List */}
        <div className="sf-popup-body px-4 py-3">
          {filteredPositions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm font-medium text-[color:var(--sf-text)]/50">
                {t('lpSelector.noPositions')}
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
                    className={`sf-popup-row group p-4 ${
                      isSelected ? 'bg-[color:var(--sf-primary)]/10' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex -space-x-2 shrink-0">
                          <div className="relative z-10">
                            <TokenIcon symbol={position.token0Symbol} id={position.token0Id} size="md" network={network} />
                          </div>
                          <div className="relative">
                            <TokenIcon symbol={position.token1Symbol} id={position.token1Id} size="md" network={network} />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-[color:var(--sf-text)] group-hover:text-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none truncate">
                              {position.token0Symbol}/{position.token1Symbol} LP
                            </span>
                            {isSelected && (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--sf-primary)] text-white shrink-0">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[color:var(--sf-text)]/40 truncate">
                            LP · {position.id}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-bold text-sm text-[color:var(--sf-text)]">
                          {position.amount}
                        </div>
                        {position.valueUSD > 0 && (
                          <div className="text-[10px] text-[color:var(--sf-text)]/60">
                            ${position.valueUSD < 0.01 ? '<0.01' : position.valueUSD > 999.99
                              ? Math.round(position.valueUSD).toLocaleString()
                              : position.valueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        )}
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
