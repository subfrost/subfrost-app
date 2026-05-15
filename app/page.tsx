import TrendingPairs from "@/app/components/TrendingPairs";
import VaultTiles from "@/app/components/VaultTiles";
import CumulativeAmmVolume from "@/app/components/CumulativeAmmVolume";
import ActivityFeed from "@/app/components/ActivityFeed";
import AlkanesMainWrapper from "@/app/components/AlkanesMainWrapper";
import PageContent from "@/app/components/PageContent";
import { DEMO_MODE_ENABLED } from "@/utils/demoMode";

export default function Home() {
  const showVaultTiles = !DEMO_MODE_ENABLED;

  return (
    <AlkanesMainWrapper>
      <PageContent className="px-2 md:px-5">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 sm:gap-4">
          {/* Top row: Trending Pair (40%), Cumulative AMM Volume (60%) */}
          <div className="grid grid-cols-1 md:grid-cols-10 gap-2 md:gap-4">
            <div className={showVaultTiles ? "md:col-span-3" : "md:col-span-4"}>
              <TrendingPairs />
            </div>
            {showVaultTiles && (
              <div className="md:col-span-3">
                <VaultTiles />
              </div>
            )}
            <div className={showVaultTiles ? "md:col-span-4" : "md:col-span-6"}>
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
