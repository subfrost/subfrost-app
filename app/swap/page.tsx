import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import SwapShell from './SwapShell';

export const metadata = { title: 'Swap' };

export default function SwapPage() {
  return (
    <PageContent className="h-full flex flex-col">
      <AlkanesMainWrapper className="flex-1 min-h-0">
        <SwapShell />
      </AlkanesMainWrapper>
    </PageContent>
  );
}


