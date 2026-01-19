'use client';

import { useState } from 'react';
import { mockContracts, type Contract } from '../data/mockContracts';

// Use Contract type from mockContracts.ts

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

export default function MarketsTable({ contracts, onContractSelect }: MarketsTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      {/* Header */}
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">Active Unlockable Positions</h3>
      </div>

      {/* Main Table */}
      <div className="md:overflow-x-auto">
          <table className="w-full">
            <thead>
              {/* Mobile header (xs and sm) - 3 columns */}
              <tr className="md:hidden border-b border-[color:var(--sf-row-border)]">
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Contract
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Market Price
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Exercise Price
                </th>
              </tr>
              {/* Desktop header (md+) - 4 columns */}
              <tr className="hidden md:table-row border-b border-[color:var(--sf-row-border)]">
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Contract
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Market Price
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Exercise Price
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.flatMap((contract) => {
                const isExpanded = expandedRows.has(contract.id);
                const rows = [
                  <tr
                    key={contract.id}
                    className="md:hidden border-b border-[color:var(--sf-row-border)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                    onClick={() => toggleRow(contract.id)}
                  >
                    {/* Mobile layout (xs and sm) - 3 separate cells */}
                    {/* Contract */}
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-2">
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
                          {contract.blocksLeft} blocks remaining
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onContractSelect({ id: contract.id, blocksLeft: contract.blocksLeft });
                          }}
                          className="ml-5 px-3 py-1.5 text-[10px] font-bold tracking-[0.08em] uppercase rounded-lg bg-[color:var(--sf-primary)] text-white hover:opacity-90 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none whitespace-nowrap w-fit"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                    {/* Market Price */}
                    <td className="px-6 py-4 align-top">
                      <div className="text-sm text-[color:var(--sf-text)]">
                        {contract.marketPriceNum.toFixed(3)} BTC
                      </div>
                    </td>
                    {/* Exercise Price */}
                    <td className="px-6 py-4 align-top">
                      <div className="text-sm font-medium text-[color:var(--sf-text)]">
                        {calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC
                      </div>
                    </td>
                  </tr>,
                  /* Mobile distribution bar row */
                  <tr
                    key={`${contract.id}-bar-mobile`}
                    className="md:hidden border-b border-[color:var(--sf-row-border)] hover:bg-[color:var(--sf-primary)]/10 cursor-pointer"
                    onClick={() => toggleRow(contract.id)}
                  >
                    <td colSpan={3} className="px-6 pb-4 pt-0">
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
                            {contract.remaining.toFixed(1)} BTC ({((contract.remaining / contract.totalSupply) * 100).toFixed(1)}%) remaining
                            {contract.mempoolQueue > 0 && (
                              <span className="ml-1 text-[color:var(--sf-primary)]/90">
                                ({contract.mempoolQueue.toFixed(1)} in mempool)
                              </span>
                            )}
                          </span>
                          <span>
                            {contract.exercised.toFixed(1)} BTC ({((contract.exercised / contract.totalSupply) * 100).toFixed(1)}%) exercised
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>,
                  /* Desktop layout (md+) - separate row */
                  <tr
                    key={`${contract.id}-desktop`}
                    className="hidden md:table-row border-b border-[color:var(--sf-row-border)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                    onClick={() => toggleRow(contract.id)}
                  >
                    {/* Contract */}
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-1">
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
                          {contract.blocksLeft} blocks remaining
                        </div>
                      </div>
                    </td>
                    {/* Market Price */}
                    <td className="px-6 py-4 align-top">
                      <div className="text-sm text-[color:var(--sf-text)]">
                        {contract.marketPriceNum.toFixed(3)} BTC
                      </div>
                    </td>
                    {/* Exercise Price */}
                    <td className="px-6 py-4 align-top">
                      <div className="text-sm font-medium text-[color:var(--sf-text)]">
                        {calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4 align-top">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onContractSelect({ id: contract.id, blocksLeft: contract.blocksLeft });
                        }}
                        className="px-4 py-2 text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-[color:var(--sf-primary)] text-white hover:opacity-90 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>,
                  /* Desktop distribution bar row */
                  <tr
                    key={`${contract.id}-bar-desktop`}
                    className="hidden md:table-row border-b border-[color:var(--sf-row-border)] hover:bg-[color:var(--sf-primary)]/10 cursor-pointer"
                    onClick={() => toggleRow(contract.id)}
                  >
                    <td colSpan={4} className="px-6 pb-4 pt-0">
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
                            {contract.remaining.toFixed(1)} BTC ({((contract.remaining / contract.totalSupply) * 100).toFixed(1)}%) remaining
                            {contract.mempoolQueue > 0 && (
                              <span className="ml-1 text-[color:var(--sf-primary)]/90">
                                ({contract.mempoolQueue.toFixed(1)} in mempool)
                              </span>
                            )}
                          </span>
                          <span>
                            {contract.exercised.toFixed(1)} BTC ({((contract.exercised / contract.totalSupply) * 100).toFixed(1)}%) exercised
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>,
                ];
                if (isExpanded) {
                  rows.push(
                    <tr key={`${contract.id}-details`} className="bg-[color:var(--sf-primary)]/5">
                      <td colSpan={3} className="md:hidden px-6 py-4">
                        <div className="space-y-2 text-sm text-[color:var(--sf-text)]/80">
                          <div className="font-semibold text-[color:var(--sf-text)] mb-2">
                            {contract.id}
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Total supply:</span>
                                <div className="font-medium">{contract.totalSupply.toFixed(1)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Remaining:</span>
                                <div className="font-medium">
                                  {contract.remaining.toFixed(1)} BTC
                                  {contract.mempoolQueue > 0 && (
                                    <span className="ml-2 text-[color:var(--sf-primary)]/90">
                                      ({contract.mempoolQueue.toFixed(1)} BTC in queue)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Exercised:</span>
                                <div className="font-medium">{contract.exercised.toFixed(1)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Exercise price:</span>
                                <div className="font-medium">{calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Exercise premium:</span>
                                <div className="font-medium">{calculateExercisePremium(contract.blocksLeft).toFixed(2)}%</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Expiry Block:</span>
                                <div className="font-medium">{contract.expiryBlock.toLocaleString()}</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Created:</span>
                                <div className="font-medium">{contract.created}</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">Underlying yield:</span>
                                <div className="font-medium">{contract.underlyingYield}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td colSpan={4} className="hidden md:table-cell px-6 py-4">
                        <div className="space-y-2 text-sm text-[color:var(--sf-text)]/80">
                          <div className="font-semibold text-[color:var(--sf-text)] mb-2">
                            {contract.id}
                          </div>
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            {/* Column 1 */}
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Total supply:
                                </span>
                                <div className="font-medium">{contract.totalSupply.toFixed(1)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Remaining:
                                </span>
                                <div className="font-medium">
                                  {contract.remaining.toFixed(1)} BTC
                                  {contract.mempoolQueue > 0 && (
                                    <span className="ml-2 text-[color:var(--sf-primary)]/90">
                                      ({contract.mempoolQueue.toFixed(1)} BTC in queue)
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Exercised:
                                </span>
                                <div className="font-medium">{contract.exercised.toFixed(1)} BTC</div>
                              </div>
                            </div>
                            {/* Column 2 */}
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Exercise price:
                                </span>
                                <div className="font-medium">{calculateExercisePrice(contract.blocksLeft).toFixed(3)} BTC</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Exercise premium:
                                </span>
                                <div className="font-medium">{calculateExercisePremium(contract.blocksLeft).toFixed(2)}%</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Expiry Block:
                                </span>
                                <div className="font-medium">{contract.expiryBlock.toLocaleString()}</div>
                              </div>
                            </div>
                            {/* Column 3 */}
                            <div className="space-y-3">
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Created:
                                </span>
                                <div className="font-medium">{contract.created}</div>
                              </div>
                              <div>
                                <span className="text-xs text-[color:var(--sf-text)]/70">
                                  Underlying yield:
                                </span>
                                <div className="font-medium">{contract.underlyingYield}</div>
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

