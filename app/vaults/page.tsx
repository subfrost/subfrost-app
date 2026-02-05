import PageContent from '@/app/components/PageContent';
import MainnetFeatureNotice from '@/app/components/MainnetFeatureNotice';
import VaultShell from './VaultShell';
import VaultsPageHeader from './VaultsPageHeader';

export const metadata = { title: 'Vaults' };

export default function VaultsPage() {
  return (
    <PageContent>
      <MainnetFeatureNotice feature="vaults">
        <VaultsPageHeader>
          <VaultShell />
        </VaultsPageHeader>
      </MainnetFeatureNotice>
    </PageContent>
  );
}
