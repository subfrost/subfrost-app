'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { type Contract } from '../data/contracts';

// Calculate exercise cost premium (fee percentage) based on blocks left
// Premiums: ~5% at start (100 blocks left), 3% at 30 blocks left, 0.1% at expiry (0 blocks left)
// Quadratic curve: y = ax² + bx + c
// Points: (100, 5.0), (30, 3.0), (0, 0.1)
function calculateExercisePremium(blocksLeft: number): number {
  // Clamp blocksLeft between 0 and 100
  const x = Math.max(0, Math.min(100, blocksLeft));
  
  // Solved quadratic system for points (0, 0.1), (30, 3.0), (100, 5.0):
  // a = -0.000681, b = 0.117097, c = 0.1
  const a = -0.000681;
  const b = 0.117097;
  const c = 0.1;
  
  // Calculate premium percentage: y = -0.000681x² + 0.117097x + 0.1
  const premium = a * x * x + b * x + c;
  
  // Round to 2 decimal places and ensure it's within bounds
  return Math.max(0.1, Math.min(5.0, Math.round(premium * 100) / 100));
}

// Calculate exercise price (what you get per 1 BTC) = 1 - premium%
// At 100 blocks: premium = 5%, exercise price = 0.95 BTC
// At 30 blocks: premium = 3%, exercise price = 0.97 BTC
// At 0 blocks: premium = 0.1%, exercise price = 0.999 BTC
function calculateExercisePrice(blocksLeft: number, notionalBtc: number = 1.0): number {
  const premiumPercent = calculateExercisePremium(blocksLeft);
  // Exercise price = notional * (1 - premium/100)
  return notionalBtc * (1 - premiumPercent / 100);
}

type MarketsTableProps = {
  contracts: Contract[];
  onContractSelect: (contract: { id: string; blocksLeft: number }) => void;
};

function PositionsInfoModal({ onClose }: { onClose: () => void }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="relative w-full max-w-lg flex flex-col rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="shrink-0 bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)] rounded-t-3xl flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
            How ftrBTC Positions Work
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="sf-panel p-4">
            <div className="text-sm font-semibold text-[color:var(--sf-text)] mb-1">Time-Locked Positions</div>
            <p className="text-xs sm:text-sm text-[color:var(--sf-text)]/70">
              Each <span className="font-mono font-semibold text-[color:var(--sf-text)]">ftrBTC[xxxxxx]</span> is a time-locked BTC position with a deterministic exercise value defined by the polynomial fee curve.
            </p>
          </div>

          <div className="sf-panel p-4">
            <div className="text-sm font-semibold text-[color:var(--sf-text)] mb-1">Exercise Value</div>
            <p className="text-xs sm:text-sm text-[color:var(--sf-text)]/70">
              Exercise value is what you get if you exercise right now. It only depends on time to expiry, not on secondary market prices.
            </p>
          </div>

          <div className="sf-panel p-4">
            <div className="text-sm font-semibold text-[color:var(--sf-text)] mb-1">Last Trade</div>
            <p className="text-xs sm:text-sm text-[color:var(--sf-text)]/70">
              Last trade is the latest price from the futures market. It can trade above or below spot — premiums are constant regardless of secondary prices.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MarketsTable({ contracts, onContractSelect }: MarketsTableProps) {
  const { t } = useTranslation();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showPositionsInfo, setShowPositionsInfo] = useState(false);

  const toggleRow = (contractId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(contractId)) {
      newExpanded.delete(contractId);
    } else {
      newExpanded.add(contractId);
    }
    setExpandedRows(newExpanded);
  };

  const filteredContracts = contracts;

  return (
    <div className="sf-card overflow-hidden">
      {/* Header — overflow-visible so the tooltip isn't clipped */}
      <div className="sf-card-header overflow-visible">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">{t('markets.activePositions')}</h3>
          {/* Lightbulb info button */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => setShowPositionsInfo(true)}
              className="flex items-center justify-center w-6 h-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
              aria-label="How ftrBTC positions work"
            >
              <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                <path d="M176,232a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,232Zm40-128a87.55,87.55,0,0,1-33.64,69.21A16.24,16.24,0,0,0,176,186v6a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16v-6a16,16,0,0,0-6.23-12.66A87.59,87.59,0,0,1,40,104.49C39.74,56.83,78.26,17.14,125.88,16A88,88,0,0,1,216,104Zm-16,0a72,72,0,0,0-73.74-72c-39,.92-70.47,33.39-70.26,72.39a71.65,71.65,0,0,0,27.64,56.3A32,32,0,0,1,96,186v6h24V147.31L90.34,117.66a8,8,0,0,1,11.32-11.32L128,132.69l26.34-26.35a8,8,0,0,1,11.32,11.32L136,147.31V192h24v-6a32.12,32.12,0,0,1,12.47-25.35A71.65,71.65,0,0,0,200,104Z"/>
              </svg>
            </button>
            {/* Tooltip on hover — positioned below to avoid clipping by the card's overflow-hidden */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 text-xs font-medium text-white bg-[color:var(--sf-primary)] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50">
              How positions work
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[color:var(--sf-primary)]" />
            </div>
          </div>
        </div>
      </div>

      {/* Positions Info Modal */}
      {showPositionsInfo && <PositionsInfoModal onClose={() => setShowPositionsInfo(false)} />}

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-[color:var(--sf-row-border,rgba(255,255,255,0.04))]">
        {filteredContracts.map((contract) => {
          const isExpanded = expandedRows.has(contract.id);
          return (
            <div key={contract.id}>
              <div
                className="p-4 cursor-pointer hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                onClick={() => toggleRow(contract.id)}
              >
                {/* Header row: Contract ID + Buy/Sell */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`text-[color:var(--sf-text)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <div className="font-semibold text-[color:var(--sf-text)]">{contract.id}</div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onContractSelect({ id: contract.id, blocksLeft: contract.blocksLeft });
                    }}
                    className="sf-btn-primary px-3 py-1.5 text-[10px] whitespace-nowrap"
                  >
                    {t('markets.buySell')}
                  </button>
                </div>

                {/* Blocks remaining */}
                <div className="text-xs text-[color:var(--sf-text)]/60 mb-3">
                  {contract.blocksLeft} {t('markets.blocksRemaining')}
                </div>

                {/* Price grid */}
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('markets.marketPrice')}</div>
                    <div className="text-sm text-[color:var(--sf-text)]">{contract.marketPriceNum.toFixed(3)} BTC</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">{t('markets.exercisePrice')}</div>
                    <div className="text-sm font-medium text-[color:var(--sf-text)]">{calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC</div>
                  </div>
                </div>

                {/* Distribution bar */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2.5 rounded-full bg-[color:var(--sf-glass-border)] overflow-hidden relative">
                      <div
                        className="absolute left-0 top-0 h-full bg-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none z-10"
                        style={{
                          width: `${(contract.exercised / contract.totalSupply) * 100}%`,
                        }}
                      />
                      {contract.mempoolQueue > 0 && (
                        <div
                          className="absolute left-0 top-0 h-full bg-[color:var(--sf-primary)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none z-20"
                          style={{
                            width: `${(contract.mempoolQueue / contract.totalSupply) * 100}%`,
                            left: `${(contract.exercised / contract.totalSupply) * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <span className="text-xs font-medium text-[color:var(--sf-text)] whitespace-nowrap">
                      {contract.remaining.toFixed(1)}/{contract.totalSupply.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[color:var(--sf-text)]/60">
                    <span>
                      {contract.remaining.toFixed(1)} BTC ({((contract.remaining / contract.totalSupply) * 100).toFixed(1)}%) {t('markets.remaining')}
                      {contract.mempoolQueue > 0 && (
                        <span className="ml-1 text-[color:var(--sf-primary)]/90">
                          ({contract.mempoolQueue.toFixed(1)} {t('markets.inMempool')})
                        </span>
                      )}
                    </span>
                    <span>
                      {((contract.exercised / contract.totalSupply) * 100).toFixed(1)}% {t('markets.exercised')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-[color:var(--sf-primary)]/5">
                  <div className="space-y-2 text-sm text-[color:var(--sf-text)]/80">
                    <div className="font-semibold text-[color:var(--sf-text)] mb-2">
                      {contract.id}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.totalSupply')}</span>
                        <div className="font-medium">{contract.totalSupply.toFixed(1)} BTC</div>
                      </div>
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.remainingSupply')}</span>
                        <div className="font-medium">
                          {contract.remaining.toFixed(1)} BTC
                          {contract.mempoolQueue > 0 && (
                            <span className="ml-1 text-[color:var(--sf-primary)]/90 text-xs">
                              ({contract.mempoolQueue.toFixed(1)} {t('markets.inQueue')})
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.exercisedSupply')}</span>
                        <div className="font-medium">{contract.exercised.toFixed(1)} BTC</div>
                      </div>
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.exercisePremium')}</span>
                        <div className="font-medium">{calculateExercisePremium(contract.blocksLeft).toFixed(2)}%</div>
                      </div>
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.expiryBlock')}</span>
                        <div className="font-medium">{contract.expiryBlock.toLocaleString()}</div>
                      </div>
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.created')}</span>
                        <div className="font-medium">{t('futures.blocksAgo', { count: parseInt(contract.created) || contract.created })}</div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-[color:var(--sf-text)]/70">{t('markets.underlyingYield')}</span>
                        <div className="font-medium">{t('futures.autoCompounding')}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="sf-table-header">
                <th className="px-6 py-4 text-left" colSpan={3}>
                  {t('markets.contractDetails')}
                </th>
                <th className="px-6 py-4 text-left">
                  {t('markets.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.flatMap((contract) => {
                const isExpanded = expandedRows.has(contract.id);
                const rows = [
                  <tr
                    key={`${contract.id}-desktop`}
                    className="sf-row cursor-pointer"
                    onClick={() => toggleRow(contract.id)}
                  >
                    {/* Contract + Distribution Bar */}
                    <td className="px-6 py-4" colSpan={3}>
                      <div className="flex flex-col gap-3">
                        {/* Contract Info Row */}
                        <div className="flex items-start gap-8">
                          {/* Contract */}
                          <div className="flex flex-col gap-1 min-w-[180px]">
                            <div className="flex items-center gap-2">
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                className={`text-[color:var(--sf-text)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isExpanded ? 'rotate-90' : ''}`}
                              >
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                              <div className="font-semibold text-[color:var(--sf-text)]">{contract.id}</div>
                            </div>
                            <div className="text-xs text-[color:var(--sf-text)]/60 ml-5">
                              {contract.blocksLeft} {t('markets.blocksRemaining')}
                            </div>
                          </div>
                          {/* {t('markets.marketPrice')} */}
                          <div className="min-w-[120px]">
                            <div className="text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/50 mb-1">{t('markets.marketPrice')}</div>
                            <div className="text-sm text-[color:var(--sf-text)]">
                              {contract.marketPriceNum.toFixed(3)} BTC
                            </div>
                          </div>
                          {/* {t('markets.exercisePrice')} */}
                          <div className="min-w-[120px]">
                            <div className="text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/50 mb-1">{t('markets.exercisePrice')}</div>
                            <div className="text-sm font-medium text-[color:var(--sf-text)]">
                              {calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC
                            </div>
                          </div>
                        </div>
                        {/* Distribution Bar */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2.5 rounded-full bg-[color:var(--sf-glass-border)] overflow-hidden relative">
                              <div
                                className="absolute left-0 top-0 h-full bg-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none z-10"
                                style={{
                                  width: `${(contract.exercised / contract.totalSupply) * 100}%`,
                                }}
                              />
                              {contract.mempoolQueue > 0 && (
                                <div
                                  className="absolute left-0 top-0 h-full bg-[color:var(--sf-primary)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none z-20"
                                  style={{
                                    width: `${(contract.mempoolQueue / contract.totalSupply) * 100}%`,
                                    left: `${(contract.exercised / contract.totalSupply) * 100}%`,
                                  }}
                                />
                              )}
                            </div>
                            <span className="text-xs font-medium text-[color:var(--sf-text)] whitespace-nowrap">
                              {contract.remaining.toFixed(1)}/{contract.totalSupply.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-[color:var(--sf-text)]/60">
                            <span>
                              {contract.remaining.toFixed(1)} BTC ({((contract.remaining / contract.totalSupply) * 100).toFixed(1)}%) {t('markets.remaining')}
                              {contract.mempoolQueue > 0 && (
                                <span className="ml-1 text-[color:var(--sf-primary)]/90">
                                  ({contract.mempoolQueue.toFixed(1)} {t('markets.inMempool')})
                                </span>
                              )}
                            </span>
                            <span>
                              {((contract.exercised / contract.totalSupply) * 100).toFixed(1)}% {t('markets.exercised')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 align-middle">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onContractSelect({ id: contract.id, blocksLeft: contract.blocksLeft });
                        }}
                        className="sf-btn-primary px-4 py-2"
                      >
                        {t('markets.buySell')}
                      </button>
                    </td>
                  </tr>,
                ];
                if (isExpanded) {
                  rows.push(
                    <tr key={`${contract.id}-details`} className="bg-[color:var(--sf-primary)]/5">
                      <td colSpan={4} className="px-6 py-4">
                        <div className="space-y-2 text-sm text-[color:var(--sf-text)]/80">
                          <div className="font-semibold text-[color:var(--sf-text)] mb-2">
                            {contract.id}
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            {/* Column 1 */}
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.totalSupply')}
                                </span>
                                <div className="font-medium">{contract.totalSupply.toFixed(1)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.remainingSupply')}
                                </span>
                                <div className="font-medium">
                                  {contract.remaining.toFixed(1)} BTC
                                  {contract.mempoolQueue > 0 && (
                                    <span className="ml-2 text-[color:var(--sf-primary)]/90">
                                      ({contract.mempoolQueue.toFixed(1)} BTC {t('markets.inQueue')})
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.exercisedSupply')}
                                </span>
                                <div className="font-medium">{contract.exercised.toFixed(1)} BTC</div>
                              </div>
                            </div>
                            {/* Column 2 */}
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.exercisePrice')}:
                                </span>
                                <div className="font-medium">{calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.exercisePremium')}
                                </span>
                                <div className="font-medium">{calculateExercisePremium(contract.blocksLeft).toFixed(2)}%</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.expiryBlock')}
                                </span>
                                <div className="font-medium">{contract.expiryBlock.toLocaleString()}</div>
                              </div>
                            </div>
                            {/* Column 3 */}
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.created')}
                                </span>
                                <div className="font-medium">{t('futures.blocksAgo', { count: parseInt(contract.created) || contract.created })}</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  {t('markets.underlyingYield')}
                                </span>
                                <div className="font-medium">{t('futures.autoCompounding')}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>,
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
      </div>
    </div>
  );
}

