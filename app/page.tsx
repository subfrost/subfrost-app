import TrendingPairs from "@/app/components/TrendingPairs";
import VaultTiles from "@/app/components/VaultTiles";
import CumulativeAmmVolume from "@/app/components/CumulativeAmmVolume";
import ActivityFeed from "@/app/components/ActivityFeed";
import AlkanesMainWrapper from "@/app/components/AlkanesMainWrapper";
import PageContent from "@/app/components/PageContent";

export default function Home() {
  return (
    <AlkanesMainWrapper>
      <PageContent className="px-4 md:px-5">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
          {/* Top row: Trending Pair (1/4), Trending Vault (1/4), Cumulative AMM Volume (1/2) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-1">
              <TrendingPairs />
            </div>
            <div className="lg:col-span-1">
              <VaultTiles />
            </div>
            <div className="lg:col-span-2">
              <CumulativeAmmVolume />
            </div>
          </div>
          {/* Global activity full width, compact height */}
          <ActivityFeed maxHeightClass="max-h-[40vh]" />
        </div>
      </PageContent>
    </AlkanesMainWrapper>
  );
}
