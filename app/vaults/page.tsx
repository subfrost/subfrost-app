import PageContent from '@/app/components/PageContent';
import VaultShell from './VaultShell';
import VaultsPageHeader from './VaultsPageHeader';
import VaultsUnreleasedNotice from './VaultsUnreleasedNotice';

export const metadata = { title: 'Vaults' };

export default function VaultsPage() {
  return (
    <PageContent>
      <VaultsUnreleasedNotice />
      <VaultsPageHeader>
        <VaultShell />
      </VaultsPageHeader>
    </PageContent>
  );
}
