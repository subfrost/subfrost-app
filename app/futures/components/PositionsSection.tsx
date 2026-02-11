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
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

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

      {/* ftrBTC Positions — Desktop Table */}
      <div className="hidden lg:block rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] overflow-hidden">
        <table className="w-full table-fixed">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[13%]" />
            <col className="w-[18%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-[color:var(--sf-glass-border)]">
              <th className="px-4 py-3 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                {t('positions.contract')}
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                {t('positions.amount')}
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                {t('positions.exerciseValue')}
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                {t('positions.lastTrade')}
              </th>
              <th className="px-3 py-3 text-left text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
                {t('positions.blocksLeft')}
              </th>
              <th className="px-3 py-3 text-right text-xs font-bold tracking-[0.08em] uppercase text-[color:var(--sf-text)]/70">
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
                  className={`${isExpanded ? '' : 'border-b border-[color:var(--sf-glass-border)]'} transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer ${hoveredRow === position.contract ? 'bg-[color:var(--sf-primary)]/10' : ''}`}
                  onClick={() => toggleRow(position.contract)}
                  onMouseEnter={() => setHoveredRow(position.contract)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className={`flex-shrink-0 text-[color:var(--sf-text)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <div className="font-semibold text-sm text-[color:var(--sf-text)] truncate">
                        {position.contract}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm text-[color:var(--sf-text)]">
                    {position.amount}
                  </td>
                  <td className="px-3 py-3 text-sm font-medium text-[color:var(--sf-text)]">
                    {position.exerciseValue}
                  </td>
                  <td className="px-3 py-3 text-sm font-medium text-[color:var(--sf-text)]">
                    {position.lastTrade ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-sm text-[color:var(--sf-text)]">
                    {position.timeLeft}
                  </td>
                  <td className="px-3 py-3 text-right">
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
                  <tr
                    key={`${position.contract}-details`}
                    className={`border-b border-[color:var(--sf-glass-border)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer ${hoveredRow === position.contract ? 'bg-[color:var(--sf-primary)]/10' : 'bg-[color:var(--sf-primary)]/5'}`}
                    onClick={() => toggleRow(position.contract)}
                    onMouseEnter={() => setHoveredRow(position.contract)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid grid-cols-3 gap-4 text-sm text-[color:var(--sf-text)]/80">
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
                          <div className="text-xs">
                            {t('positions.behaviourDesc')}
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

      {/* ftrBTC Positions — Mobile/Tablet Cards */}
      <div className="lg:hidden space-y-3">
        {ftrBTCPositions.map((position) => {
          const isExpanded = expandedRows.has(position.contract);
          return (
            <div
              key={position.contract}
              className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] overflow-hidden"
            >
              <div
                className="px-4 py-4 cursor-pointer transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-primary)]/10"
                onClick={() => toggleRow(position.contract)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`flex-shrink-0 text-[color:var(--sf-text)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="font-semibold text-sm text-[color:var(--sf-text)]">
                      {position.contract}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: trigger Exercise call (early or at expiry)
                    }}
                    className="px-3 py-1.5 text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-red-500 text-white hover:opacity-90 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                  >
                    {t('positions.exercise')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="text-xs text-[color:var(--sf-text)]/50">{t('positions.amount')}</span>
                    <div className="text-[color:var(--sf-text)]">{position.amount}</div>
                  </div>
                  <div>
                    <span className="text-xs text-[color:var(--sf-text)]/50">{t('positions.exerciseValue')}</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{position.exerciseValue}</div>
                  </div>
                  <div>
                    <span className="text-xs text-[color:var(--sf-text)]/50">{t('positions.lastTrade')}</span>
                    <div className="font-medium text-[color:var(--sf-text)]">{position.lastTrade ?? '—'}</div>
                  </div>
                  <div>
                    <span className="text-xs text-[color:var(--sf-text)]/50">{t('positions.blocksLeft')}</span>
                    <div className="text-[color:var(--sf-text)]">{position.timeLeft}</div>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div
                  className="border-t border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5 px-4 py-4 cursor-pointer"
                  onClick={() => toggleRow(position.contract)}
                >
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-[color:var(--sf-text)]/80">
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
                      <div className="font-medium">{position.amount} ftrBTC</div>
                    </div>
                    <div>
                      <span className="text-xs text-[color:var(--sf-text)]/70">
                        {t('positions.exerciseNow')}
                      </span>
                      <div className="font-medium">{position.exerciseValue}</div>
                    </div>
                    {position.lastTrade && (
                      <div>
                        <span className="text-xs text-[color:var(--sf-text)]/70">
                          {t('positions.lastMarketTrade')}
                        </span>
                        <div className="font-medium">{position.lastTrade}</div>
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-[color:var(--sf-text)]/70">
                        {t('positions.timeToExpiry')}
                      </span>
                      <div className="font-medium">{position.timeLeft}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-[color:var(--sf-text)]/70">
                        {t('positions.behaviour')}
                      </span>
                      <div className="text-xs">
                        {t('positions.behaviourDesc')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

