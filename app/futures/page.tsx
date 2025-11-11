'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import { useFuturesMarkets } from '@/hooks/useFuturesMarkets';

export default function FuturesPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title="Futures" />}>
        <FuturesMarketList />
      </AlkanesMainWrapper>
    </PageContent>
  );
}

function FuturesMarketList() {
  const { data, isLoading, error } = useFuturesMarkets();

  if (isLoading) {
    return (
      <div className="text-sm text-[color:var(--sf-text)]/70">
        Loading futures markets…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-sm text-red-500">
        Error loading futures markets: {error.message}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-sm text-[color:var(--sf-text)]/80">
        No futures markets available yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {data.map((market) => (
          <FuturesMarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
}

function FuturesMarketCard({ market }: { market: any }) {
  const priceChange = market.priceChange24h || 0;
  const priceChangeClass = priceChange >= 0 ? 'text-green-500' : 'text-red-500';

  return (
    <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 hover:border-[color:var(--sf-text)]/30 transition-colors cursor-pointer">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[color:var(--sf-text)]">
            {market.symbol}
          </h3>
          <p className="text-xs text-[color:var(--sf-text)]/50">
            {market.type === 'perpetual' ? 'Perpetual' : 'Expiry'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-[color:var(--sf-text)]">
            ${market.markPrice?.toFixed(2) || '0.00'}
          </div>
          <div className={`text-sm font-medium ${priceChangeClass}`}>
            {priceChange >= 0 ? '+' : ''}
            {priceChange.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[color:var(--sf-text)]/50 mb-1">24h Volume</div>
          <div className="font-medium text-[color:var(--sf-text)]">
            ${(market.volume24h || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[color:var(--sf-text)]/50 mb-1">Open Interest</div>
          <div className="font-medium text-[color:var(--sf-text)]">
            ${(market.openInterest || 0).toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[color:var(--sf-text)]/50 mb-1">Funding Rate</div>
          <div className="font-medium text-[color:var(--sf-text)]">
            {(market.fundingRate || 0).toFixed(4)}%
          </div>
        </div>
        <div>
          <div className="text-[color:var(--sf-text)]/50 mb-1">Next Funding</div>
          <div className="font-medium text-[color:var(--sf-text)]">
            {market.nextFundingTime || 'N/A'}
          </div>
        </div>
      </div>

      <button className="mt-4 w-full px-4 py-2 rounded-lg bg-[color:var(--sf-text)] text-white hover:opacity-90 transition-opacity text-sm font-medium">
        Trade
      </button>
    </div>
  );
}
