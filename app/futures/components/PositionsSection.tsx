'use client';

import { useState } from 'react';

type FtrPosition = {
  contract: string;
  amount: string;        // in ftrBTC
  exerciseValue: string; // deterministic polynomial value in BTC
  lastTrade?: string;    // optional: last secondary market trade
  timeLeft: string;      // blocks left
};

export default function PositionsSection() {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Mock ftrBTC positions (max 100 blocks in FE context)
  const ftrBTCPositions: FtrPosition[] = [
    {
      contract: 'ftrBTC[8af93c]',
      amount: '1.000',
      exerciseValue: '0.942 BTC',  // poly floor at current height
      lastTrade: '0.948 BTC',      // secondary market (optional)
      timeLeft: '6 blocks',
    },
    {
      contract: 'ftrBTC[c9fe12]',
      amount: '3.100',
      exerciseValue: '1.698 BTC',
      lastTrade: '1.741 BTC',
      timeLeft: '45 blocks',
    },
  ];

  const toggleRow = (contractId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(contractId)) {
      newExpanded.delete(contractId);
    } else {
      newExpanded.add(contractId);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <div className="space-y-6">
      {/* ftrBTC EXPLAINER */}
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-6 py-4 text-sm text-[color:var(--sf-text)]/80">
        <div className="font-semibold text-[color:var(--sf-text)] mb-1">
          How ftrBTC positions work
        </div>
        <ul className="list-disc list-inside space-y-1 text-xs md:text-sm">
          <li>
            Each <span className="font-mono font-semibold">ftrBTC[xxxxxx]</span> is a
            time-locked BTC position with a deterministic exercise value defined by the
            polynomial fee curve.
          </li>
          <li>
            <span className="font-semibold">Exercise value</span> is what you get if you
            exercise right now via <span className="font-mono">Exercise</span> (dxBTC
            redemption). It only depends on time to expiry, not on secondary market prices.
          </li>
          <li>
            <span className="font-semibold">Last trade</span> is the latest price from the
            futures market. It can trade above or below spot — premiums are constant regardless
            of secondary prices.
          </li>
        </ul>
      </div>

      {/* ftrBTC Positions Table */}
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--sf-glass-border)]">
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    Contract
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    Amount (ftrBTC)
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    Exercise value (poly)
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    Last trade (market)
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    Blocks left
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {ftrBTCPositions.flatMap((position) => {
                  const isExpanded = expandedRows.has(position.contract);
                  const rows = [
                    <tr
                      key={position.contract}
                      className="border-b border-[color:var(--sf-glass-border)] hover:bg-[color:var(--sf-primary)]/10 transition-colors cursor-pointer"
                      onClick={() => toggleRow(position.contract)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className={`text-[color:var(--sf-text)]/50 transition-transform ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                          >
                            <path d="M9 18l6-6-6-6" />
                          </svg>
                          <div className="font-semibold text-[color:var(--sf-text)]">
                            {position.contract}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-[color:var(--sf-text)]">
                        {position.amount}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-[color:var(--sf-text)]">
                        {position.exerciseValue}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-[color:var(--sf-text)]">
                        {position.lastTrade ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-[color:var(--sf-text)]">
                        {position.timeLeft}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: trigger Exercise call (early or at expiry)
                          }}
                          className="px-4 py-2 text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-red-500 text-white hover:opacity-90 transition-opacity"
                        >
                          Exercise
                        </button>
                      </td>
                    </tr>,
                  ];

                  if (isExpanded) {
                    rows.push(
                      <tr key={`${position.contract}-details`} className="bg-[color:var(--sf-primary)]/5">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="space-y-3">
                            <div className="text-sm text-[color:var(--sf-text)]/80">
                              <div className="font-semibold text-[color:var(--sf-text)] mb-2">
                                Position details
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    Contract:
                                  </span>
                                  <div className="font-medium">{position.contract}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    Notional:
                                  </span>
                                  <div className="font-medium">
                                    {position.amount} ftrBTC
                                  </div>
                                </div>
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    Exercise now (poly):
                                  </span>
                                  <div className="font-medium">
                                    {position.exerciseValue}
                                  </div>
                                </div>
                                {position.lastTrade && (
                                  <div>
                                    <span className="text-xs text-[color:var(--sf-text)]/70">
                                      Last market trade:
                                    </span>
                                    <div className="font-medium">
                                      {position.lastTrade}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    Time to expiry:
                                  </span>
                                  <div className="font-medium">{position.timeLeft}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    Behaviour:
                                  </span>
                                  <div className="text-xs md:text-sm">
                                    Exercise value moves deterministically along the
                                    polynomial curve as blocks pass. Holding to expiry
                                    removes the time penalty (0% fee).
                                  </div>
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
    </div>
  );
}

