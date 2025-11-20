import TrendingPairs from "@/app/components/TrendingPairs";
import VaultTiles from "@/app/components/VaultTiles";
// import ChartPlaceholder from "@/app/components/ChartPlaceholder";
import ActivityFeed from "@/app/components/ActivityFeed";
import AlkanesMainWrapper from "@/app/components/AlkanesMainWrapper";
import PageHeader from "@/app/components/PageHeader";
import PageContent from "@/app/components/PageContent";

export default function Home() {
  return (
    <AlkanesMainWrapper>
      <PageContent className="px-4 md:px-5">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          {/* Top row: 1/4 Trending Pair, 3/4 Trending Vaults */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1">
              <TrendingPairs />
            </div>
            <div className="lg:col-span-3">
              <VaultTiles />
            </div>
          </div>
          {/* Global activity full width, compact height */}
          <ActivityFeed maxHeightClass="max-h-[40vh]" />
        </div>
      </PageContent>
    </AlkanesMainWrapper>
  );
}
