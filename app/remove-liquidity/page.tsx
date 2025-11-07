'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import RemoveLiquidity from './RemoveLiquidity';
import { Suspense } from 'react';

export default function RemoveLiquidityPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title="Remove Liquidity" />}>
        <div className="flex w-full justify-center py-8">
          <Suspense fallback={<div>Loading...</div>}>
            <RemoveLiquidity />
          </Suspense>
        </div>
      </AlkanesMainWrapper>
    </PageContent>
  );
}
