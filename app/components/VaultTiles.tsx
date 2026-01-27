'use client';

import Link from 'next/link';
import TokenIcon from '@/app/components/TokenIcon';
import { AVAILABLE_VAULTS } from '@/app/vaults/constants';

function getHistoricalApy(apyHistory?: number[]): string {
  if (!apyHistory || apyHistory.length === 0) return '-';
  const avg = apyHistory.reduce((sum, val) => sum + val, 0) / apyHistory.length;
  return `${avg.toFixed(1)}%`;
}

export default function VaultTiles() {
  const filteredVaults = AVAILABLE_VAULTS
    .filter(vault => vault.id !== 'yv-frbtc')
    .sort((a, b) => {
      if (a.id === 'dx-btc') return -1;
      if (b.id === 'dx-btc') return 1;
      return 0;
    });
  const featured = filteredVaults.slice(0, 3);

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">Trending Vaults</h3>
          <Link href="/vaults" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">View all</Link>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {featured.map((v) => (
            <Link
              key={v.id}
              href={`/vaults?vault=${v.id}`}
              className="rounded-2xl bg-[color:var(--sf-surface)]/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-primary)]/10 focus:outline-none"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6">
                    <TokenIcon id={v.tokenId} symbol={v.tokenSymbol} size="sm" />
                  </div>
                  <span className="text-sm font-bold text-[color:var(--sf-text)]">{v.name}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Deposits</div>
                  <div className="font-bold text-[color:var(--sf-text)]">-</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Hist. APY</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{getHistoricalApy(v.apyHistory)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">Est. APY</div>
                  <div className="inline-flex items-center rounded-full bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)] px-2.5 py-0.5 text-xs font-bold text-[color:var(--sf-info-green-title)]">{v.estimatedApy ? `${v.estimatedApy}%` : '-'}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}


