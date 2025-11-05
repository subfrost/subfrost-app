import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import SwapShell from './SwapShell';

export const metadata = { title: 'Swap' };

export default function SwapPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper>
        <SwapShell />
      </AlkanesMainWrapper>
    </PageContent>
  );
}


