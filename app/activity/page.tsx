'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import PageContent from '@/app/components/PageContent';
import ActivityList from './components/ActivityList';

export default function ActivityPage() {
  return (
    <PageContent>
      <AlkanesMainWrapper header={<PageHeader title="Activity" />}>
        <ActivityList />
      </AlkanesMainWrapper>
    </PageContent>
  );
}
