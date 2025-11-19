'use client';

import Link from 'next/link';
import TokenIcon from '@/app/components/TokenIcon';
import { AVAILABLE_VAULTS } from '@/app/vaults/constants';

export default function VaultTiles() {
  const featured = AVAILABLE_VAULTS.slice(0, 6);

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[color:var(--sf-text)]">Vaults</h3>
        <Link href="/vaults" className="text-xs text-[color:var(--sf-primary)] hover:underline">View all</Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {featured.map((v) => (
          <Link
            key={v.id}
            href="/vaults"
            className="group rounded-xl border border-[color:var(--sf-glass-border)] bg-white/5 p-3 transition-colors hover:bg-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border border-white/20 bg-white/10 p-1">
                <TokenIcon id={v.tokenId} symbol={v.tokenSymbol} size="md" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[color:var(--sf-text)]">{v.name}</div>
                <div className="truncate text-xs text-[color:var(--sf-text)]/60">{v.description}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/60">Est. APY</div>
              <div className="text-sm font-semibold text-green-500">{v.estimatedApy ? `${v.estimatedApy}%` : '-'}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


