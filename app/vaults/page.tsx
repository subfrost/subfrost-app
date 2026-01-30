import PageContent from '@/app/components/PageContent';
import VaultShell from './VaultShell';
import VaultsPageHeader from './VaultsPageHeader';

export const metadata = { title: 'Vaults' };

export default function VaultsPage() {
  return (
    <PageContent>
      <VaultsPageHeader>
        <VaultShell />
      </VaultsPageHeader>
    </PageContent>
  );
}
