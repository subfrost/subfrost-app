'use client';

import Link from 'next/link';
import TokenIcon from '@/app/components/TokenIcon';
import { AVAILABLE_VAULTS } from '@/app/vaults/constants';

export default function VaultTiles() {
  const featured = AVAILABLE_VAULTS.slice(0, 3);

  return (
    <div className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] backdrop-blur-xl overflow-hidden shadow-[0_8px_32px_rgba(40,67,114,0.12)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-glass-border)] bg-white/40">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">Trending Vaults</h3>
          <Link href="/vaults" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-colors">View all</Link>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((v) => (
            <Link
              key={v.id}
              href="/vaults"
              className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 backdrop-blur-md transition-all hover:shadow-[0_8px_24px_rgba(40,67,114,0.15)] hover:border-[color:var(--sf-primary)]/40 hover:bg-white/20 sf-focus-ring"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full border border-white/20 bg-white/10 p-1">
                  <TokenIcon id={v.tokenId} symbol={v.tokenSymbol} size="md" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[color:var(--sf-text)]">{v.name}</div>
                  <div className="truncate text-xs text-[color:var(--sf-text)]/60">{v.description}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">Est. APY</div>
                <div className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">{v.estimatedApy ? `${v.estimatedApy}%` : '-'}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}


