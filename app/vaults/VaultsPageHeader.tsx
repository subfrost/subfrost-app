'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import { useTranslation } from '@/hooks/useTranslation';
import { useDemoGate } from '@/hooks/useDemoGate';

export default function VaultsPageHeader({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const isDemoGated = useDemoGate();

  return (
    <AlkanesMainWrapper header={<PageHeader title={<>{t('vaults.title')}{isDemoGated && <span className="block text-lg font-semibold text-[color:var(--sf-text)]/60">{t('vaults.comingSoon')}</span>}</>} />}>
      {children}
    </AlkanesMainWrapper>
  );
}
