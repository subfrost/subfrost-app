'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import { useTranslation } from '@/hooks/useTranslation';

export default function VaultsPageHeader({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <AlkanesMainWrapper header={<PageHeader title={t('vaults.title')} />}>
      {children}
    </AlkanesMainWrapper>
  );
}
