import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import VaultShell from './VaultShell';

export const metadata = { title: 'Vaults' };

export default function VaultsPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper>
        <VaultShell />
      </AlkanesMainWrapper>
    </PageContent>
  );
}
