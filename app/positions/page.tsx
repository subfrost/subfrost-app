'use client';

import { useRouter } from 'next/navigation';
import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import TokenIcon from '@/app/components/TokenIcon';
import { useWallet } from '@/context/WalletContext';
import { useAddressPositions } from '@/hooks/useAddressPositions';
import { formatAlkanes } from '@/utils/formatters';
import { Plus, Minus } from 'lucide-react';

export default function PositionsPage() {
  const router = useRouter();
  const { address, network, isConnected } = useWallet();
  const { data: positions = [], isLoading } = useAddressPositions(address);

  if (!isConnected) {
    return (
      <PageContent>
        <AlkanesMainWrapper header={<PageHeader title="Your Positions" />}>
          <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-center text-[color:var(--sf-text)]/80">
            Please connect your wallet to view your positions.
          </div>
        </AlkanesMainWrapper>
      </PageContent>
    );
  }

  if (isLoading) {
    return (
      <PageContent>
        <AlkanesMainWrapper header={<PageHeader title="Your Positions" />}>
          <div className="text-sm text-[color:var(--sf-text)]/70">Loading positions…</div>
        </AlkanesMainWrapper>
      </PageContent>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <PageContent>
        <AlkanesMainWrapper header={<PageHeader title="Your Positions" />}>
          <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-center">
            <p className="mb-4 text-[color:var(--sf-text)]/80">No liquidity positions found.</p>
            <button
              onClick={() => router.push('/earn')}
              className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--sf-primary)] px-6 py-3 text-sm font-bold text-white transition-all hover:bg-[color:var(--sf-primary-pressed)] sf-focus-ring"
            >
              <Plus size={16} />
              Add Liquidity
            </button>
          </div>
        </AlkanesMainWrapper>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title="Your Positions" />}>
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => router.push('/earn')}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-[color:var(--sf-primary)] bg-white px-4 py-2 text-sm font-bold text-[color:var(--sf-primary)] transition-all hover:bg-[color:var(--sf-primary)] hover:text-white sf-focus-ring"
          >
            <Plus size={16} />
            Add Liquidity
          </button>
        </div>

        <div className="space-y-3">
          {positions.map((position) => (
            <div
              key={position.id}
              className="rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 shadow-[0_4px_16px_rgba(40,67,114,0.12)] backdrop-blur-xl transition-all hover:shadow-[0_6px_24px_rgba(40,67,114,0.18)]"
            >
              {/* Header with token icons and names */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex -space-x-2">
                  <TokenIcon
                    symbol={position.currencyA.name}
                    id={position.currencyA.id}
                    size="lg"
                    network={network}
                    className="border-2 border-white"
                  />
                  <TokenIcon
                    symbol={position.currencyB.name}
                    id={position.currencyB.id}
                    size="lg"
                    network={network}
                    className="border-2 border-white"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[color:var(--sf-text)]">
                    {position.currencyA.name} / {position.currencyB.name}
                  </h3>
                  <p className="text-xs text-[color:var(--sf-text)]/60">Liquidity Pool</p>
                </div>
              </div>

              {/* Position details */}
              <div className="mb-4 grid grid-cols-2 gap-4 rounded-xl border border-[color:var(--sf-outline)] bg-white/40 p-4">
                <div>
                  <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">Your LP Tokens</p>
                  <p className="text-lg font-bold text-[color:var(--sf-text)]">
                    {formatAlkanes(position.balance)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">Pool TVL</p>
                  <p className="text-lg font-bold text-[color:var(--sf-text)]">
                    ${position.poolTvlInUsd?.toLocaleString() ?? '-'}
                  </p>
                </div>
              </div>

              {/* Pooled tokens */}
              <div className="mb-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">
                  Pooled Tokens
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">{position.currencyA.name}:</span>
                  <span className="font-semibold text-[color:var(--sf-text)]">
                    {formatAlkanes(position.token0Amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[color:var(--sf-text)]/70">{position.currencyB.name}:</span>
                  <span className="font-semibold text-[color:var(--sf-text)]">
                    {formatAlkanes(position.token1Amount)}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => router.push(`/earn?poolId=${position.id}`)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--sf-primary)] bg-white px-4 py-3 text-sm font-bold text-[color:var(--sf-primary)] transition-all hover:bg-[color:var(--sf-primary)] hover:text-white sf-focus-ring"
                >
                  <Plus size={16} />
                  Add
                </button>
                <button
                  onClick={() => router.push(`/remove-liquidity?poolId=${position.id}`)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--sf-primary)] px-4 py-3 text-sm font-bold text-white transition-all hover:bg-[color:var(--sf-primary-pressed)] sf-focus-ring"
                >
                  <Minus size={16} />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </AlkanesMainWrapper>
    </PageContent>
  );
}
