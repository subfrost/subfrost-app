import PageContent from '@/app/components/PageContent';
import ComingSoonOverlay from '@/app/components/ComingSoonOverlay';
import VaultShell from './VaultShell';
import VaultsPageHeader from './VaultsPageHeader';

export const metadata = { title: 'Vaults' };

export default function VaultsPage() {
  return (
    <PageContent>
      <ComingSoonOverlay>
        <VaultsPageHeader>
          <VaultShell />
        </VaultsPageHeader>
      </ComingSoonOverlay>
    </PageContent>
  );
}
