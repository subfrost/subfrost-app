'use client';

import AlkanesMainWrapper from "@/app/components/AlkanesMainWrapper";
import PageHeader from "@/app/components/PageHeader";
import PageContent from "@/app/components/PageContent";
import ActivityFeed from "@/app/components/ActivityFeed";

export default function ActivityPage() {
  return (
    <AlkanesMainWrapper>
      <PageContent className="px-4 md:px-5">
        <ActivityFeed isFullPage />
      </PageContent>
    </AlkanesMainWrapper>
  );
}


