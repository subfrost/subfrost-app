'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import { useTranslation } from '@/hooks/useTranslation';
import { useWallet } from '@/context/WalletContext';

export default function VaultsPageHeader({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { network } = useWallet();
  const isRegtest = network?.includes('regtest');

  return (
    <AlkanesMainWrapper header={<PageHeader title={<>{t('vaults.title')}{!isRegtest && <span className="block text-lg font-semibold text-[color:var(--sf-text)]/60">{t('vaults.comingSoon')}</span>}</>} />}>
      {children}
    </AlkanesMainWrapper>
  );
}
