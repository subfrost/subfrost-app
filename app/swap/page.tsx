import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import ComingSoonOverlay from '@/app/components/ComingSoonOverlay';
import SwapShell from './SwapShell';

export const metadata = { title: 'Swap' };

export default function SwapPage() {
  return (
    <PageContent className="h-full flex flex-col">
      <ComingSoonOverlay>
        <AlkanesMainWrapper className="flex-1 min-h-0">
          <SwapShell />
        </AlkanesMainWrapper>
      </ComingSoonOverlay>
    </PageContent>
  );
}


