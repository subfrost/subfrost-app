'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import CreateLiquidity from './CreateLiquidity';

export default function EarnPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title="Add Liquidity" />}>
        <div className="flex w-full justify-center py-8">
          <CreateLiquidity />
        </div>
      </AlkanesMainWrapper>
    </PageContent>
  );
}


