import TrendingPairs from "@/app/components/TrendingPairs";
import VaultTiles from "@/app/components/VaultTiles";
// import ChartPlaceholder from "@/app/components/ChartPlaceholder";
import ActivityFeed from "@/app/components/ActivityFeed";
import AlkanesMainWrapper from "@/app/components/AlkanesMainWrapper";
import PageHeader from "@/app/components/PageHeader";
import PageContent from "@/app/components/PageContent";

export default function Home() {
  return (
    <AlkanesMainWrapper header={<PageHeader title={<span>Home</span>} />} >
      <PageContent className="px-4 md:px-5">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          {/* Wide trending pairs at top */}
          <TrendingPairs />
          {/* Global activity full width, compact height */}
          <ActivityFeed maxHeightClass="max-h-[40vh]" />
          {/* Vault tiles below */}
          <VaultTiles />
        </div>
      </PageContent>
    </AlkanesMainWrapper>
  );
}
