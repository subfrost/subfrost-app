'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

type FtrPosition = {
  contract: string;
  amount: string;        // in ftrBTC
  exerciseValue: string; // deterministic polynomial value in BTC
  lastTrade?: string;    // optional: last secondary market trade
  timeLeft: string;      // blocks left
};

export default function PositionsSection() {
  const { t } = useTranslation();
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
          {t('positions.howPositionsWork')}
        </div>
        <ul className="list-disc list-inside space-y-1 text-xs md:text-sm">
          <li>{t('positions.positionExplanation')}</li>
          <li>{t('positions.exerciseExplanation')}</li>
          <li>{t('positions.lastTradeExplanation')}</li>
        </ul>
      </div>

      {/* ftrBTC Positions Table */}
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--sf-glass-border)]">
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    {t('positions.contract')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    {t('positions.amount')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    {t('positions.exerciseValue')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    {t('positions.lastTrade')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    {t('positions.blocksLeft')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                    {t('positions.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ftrBTCPositions.flatMap((position) => {
                  const isExpanded = expandedRows.has(position.contract);
                  const rows = [
                    <tr
                      key={position.contract}
                      className="border-b border-[color:var(--sf-glass-border)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
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
                            className={`text-[color:var(--sf-text)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
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
                          className="px-4 py-2 text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-red-500 text-white hover:opacity-90 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                        >
                          {t('positions.exercise')}
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
                                {t('positions.positionDetails')}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    {t('positions.contractLabel')}
                                  </span>
                                  <div className="font-medium">{position.contract}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    {t('positions.notional')}
                                  </span>
                                  <div className="font-medium">
                                    {position.amount} ftrBTC
                                  </div>
                                </div>
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    {t('positions.exerciseNow')}
                                  </span>
                                  <div className="font-medium">
                                    {position.exerciseValue}
                                  </div>
                                </div>
                                {position.lastTrade && (
                                  <div>
                                    <span className="text-xs text-[color:var(--sf-text)]/70">
                                      {t('positions.lastMarketTrade')}
                                    </span>
                                    <div className="font-medium">
                                      {position.lastTrade}
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    {t('positions.timeToExpiry')}
                                  </span>
                                  <div className="font-medium">{position.timeLeft}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-[color:var(--sf-text)]/70">
                                    {t('positions.behaviour')}
                                  </span>
                                  <div className="text-xs md:text-sm">
                                    {t('positions.behaviourDesc')}
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

