import { Suspense } from 'react';
import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import SwapShell from './SwapShell';

export const metadata = { title: 'Swap' };

export default function SwapPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper>
        <Suspense fallback={<div>Loading SwapShell...</div>}>
          <SwapShell />
        </Suspense>
      </AlkanesMainWrapper>
    </PageContent>
  );
}


