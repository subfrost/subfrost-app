import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import PageHeader from '@/app/components/PageHeader';
import VaultShell from './VaultShell';

export const metadata = { title: 'Vaults' };

export default function VaultsPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title={<>DeFi Vaults<span className="block text-lg font-semibold text-[color:var(--sf-text)]/60">(Coming Soon)</span></>} />}>
        <VaultShell />
      </AlkanesMainWrapper>
    </PageContent>
  );
}
