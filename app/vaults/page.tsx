import { Suspense } from 'react';
import PageContent from '@/app/components/PageContent';
import MainnetFeatureNotice from '@/app/components/MainnetFeatureNotice';
import VaultShell from './VaultShell';
import VaultsPageHeader from './VaultsPageHeader';

export const metadata = { title: 'Vaults' };

// VaultShell consumes useSearchParams() — Next.js 16 prerender requires this
// to live inside a <Suspense> boundary, otherwise the build aborts with
// "useSearchParams() should be wrapped in a suspense boundary". The boundary
// is invisible to users: during prerender it short-circuits to the fallback,
// then hydrates to the full shell on client mount.
export default function VaultsPage() {
  return (
    <PageContent>
      <MainnetFeatureNotice feature="vaults">
        <VaultsPageHeader>
          <Suspense fallback={null}>
            <VaultShell />
          </Suspense>
        </VaultsPageHeader>
      </MainnetFeatureNotice>
    </PageContent>
  );
}
