'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { PairIcon } from './PairIcon';
import { usePoolForPair } from '@/app/hooks/usePoolForPair';
import { usePoolDetails } from '@/app/hooks/usePoolDetails';
import { useBtcPrice } from '@/app/hooks/useBtcPrice';

export function PoolStats({ sellId, buyId }: { sellId?: string | null; buyId?: string | null }) {
  const { poolId } = usePoolForPair(sellId ?? undefined, buyId ?? undefined);
  const { data: details, isLoading } = usePoolDetails(poolId);
  const { data: btc } = useBtcPrice();

  if (!sellId || !buyId) return null;
  if (!poolId) {
    return (
      <div className="rounded-md border border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (isLoading || !details) {
    return (
      <div className="rounded-md border border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const aUsd = details.currencyA.tvlInUsd ?? 0;
  const bUsd = details.currencyB.tvlInUsd ?? 0;
  const totalUsd = (aUsd + bUsd) || details.tvl || 0;
  const pctA = totalUsd > 0 ? Math.max(2, Math.min(98, (aUsd / totalUsd) * 100)) : 50;
  const toBtc = (usd?: number) => (usd && btc?.usd ? usd / btc.usd : undefined);

  return (
    <div className="rounded-md border border-white/10 p-4">
      <div className="flex items-center gap-3 mb-4">
        <PairIcon left={{ id: details.currencyA.id, name: details.currencyA.name }} right={{ id: details.currencyB.id, name: details.currencyB.name }} size="sm" />
        <div>
          <div className="text-sm text-blue-200">TVL</div>
          <div className="text-base font-semibold">${Number(totalUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          {toBtc(totalUsd) !== undefined && (
            <div className="text-xs text-muted-foreground">{Number(toBtc(totalUsd)).toLocaleString(undefined, { maximumFractionDigits: 2 })} ₿</div>
          )}
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-muted-foreground">Pool ID</div>
          <div className="text-[11px] opacity-80">{poolId}</div>
        </div>
      </div>

      <div className="mb-2 text-sm text-muted-foreground">Pool Balances</div>
      <div className="relative h-3 w-full rounded-full bg-white/10 overflow-hidden">
        <div className="absolute left-0 top-0 h-full bg-blue-500" style={{ width: `${pctA}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <div>
          <div className="font-medium">{formatToken(details.currencyA.amount)} {details.currencyA.name}</div>
          <div className="text-xs text-muted-foreground">${Number(aUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
        <div className="text-right">
          <div className="font-medium">{formatToken(details.currencyB.amount)} {details.currencyB.name}</div>
          <div className="text-xs text-muted-foreground">${Number(bUsd).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <StatRow label="24h Volume" value={`$${Number(details.volume24h).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <StatRow label="30d Volume" value={`$${Number(details.volume30d).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function formatToken(amount?: string) {
  const n = Number(amount ?? '0');
  return (n / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });
}


