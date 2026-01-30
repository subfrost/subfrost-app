'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import { usePools } from '@/hooks/usePools';
import { useTranslation } from '@/hooks/useTranslation';

export default function PoolsPage() {
  const { t } = useTranslation();

  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title={t('nav.pools')} />}>
        <PoolsList />
      </AlkanesMainWrapper>
    </PageContent>
  );
}

function PoolsList() {
  const { data, isLoading } = usePools({});
  const { t } = useTranslation();

  if (isLoading) {
    return <div className="text-sm text-[color:var(--sf-text)]/70">{t('pool.loading')}</div>;
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-sm text-[color:var(--sf-text)]/80">
        {t('pool.noPools')}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[color:var(--sf-glass-border)] rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)]">
      {data.items.map((pool: any) => (
        <li key={pool.id} className="p-4">{pool.name ?? pool.id}</li>
      ))}
    </ul>
  );
}


