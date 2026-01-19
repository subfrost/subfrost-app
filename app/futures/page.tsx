'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import PageHeader from '@/app/components/PageHeader';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import ContractDetailModal from './components/ContractDetailModal';
import MarketsTable from './components/MarketsTable';
import HowItWorksModal from './components/HowItWorksModal';
import OpenPositionForm from './components/OpenPositionForm';
import PositionsSection from './components/PositionsSection';
import FuturesHeaderTabs from './components/FuturesHeaderTabs';
import { mockContracts } from './data/mockContracts';
import { useFutures } from '@/hooks/useFutures';

type TabKey = 'markets' | 'positions';

export default function FuturesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('markets');
  const [selectedContract, setSelectedContract] = useState<{ id: string; blocksLeft: number } | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch real futures data from regtest
  const { futures, currentBlock, loading, error, refetch, generateFuture } = useFutures();
  
  // Use real data if available, otherwise fall back to mocks
  const contracts = futures.length > 0 ? futures.map(f => ({
    id: f.id,
    timeLeft: f.timeLeft,
    blocksLeft: f.blocksLeft,
    marketPrice: `Buy at ${f.marketPrice.toFixed(3)} BTC`,
    marketPriceNum: f.marketPrice,
    expiryBlock: f.expiryBlock,
    created: f.created,
    underlyingYield: f.underlyingYield,
    totalSupply: f.totalSupply,
    exercised: f.exercised,
    mempoolQueue: f.mempoolQueue,
    remaining: f.remaining,
  })) : mockContracts;

  // Mock contract data - find the actual contract to get real values
  const selectedContractData = contracts.find(c => c.id === selectedContract?.id);
  const contractData = selectedContract
    ? {
        id: selectedContract.id,
        blocksLeft: selectedContract.blocksLeft,
        expiryBlock: selectedContractData?.expiryBlock ?? 982110,
        created: selectedContractData?.created ?? '6 blocks ago',
        totalSupply: selectedContractData?.totalSupply ?? 100,
        remaining: selectedContractData?.remaining ?? 75,
        exercised: selectedContractData?.exercised ?? 25,
        vaultFreeCapital: 310,
        liquidityDepth: 21,
      }
    : null;

  const handleContractSelect = (contractId: string, blocksLeft: number) => {
    setSelectedContract({ id: contractId, blocksLeft });
  };
  
  // Handle generate future button
  const handleGenerateFuture = async () => {
    try {
      await generateFuture();
      // Auto-refresh after generating
      setTimeout(() => {
        refetch();
      }, 3000);
      alert('✅ Future generated successfully! Refreshing in 3 seconds...');
    } catch (err) {
      alert(`❌ Failed to generate future: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };
  
  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        new Promise(resolve => setTimeout(resolve, 500)) // minimum 500ms spin
      ]);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <PageContent>
      <AlkanesMainWrapper header={
        <PageHeader
          title={<>Coinbase Futures<span className="block text-lg font-semibold text-[color:var(--sf-text)]/60">(Coming Soon)</span></>}
          subtitle={
            <div className="flex flex-col gap-3">
              {/* Row 1: Block info, futures count, Generate Future button */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm text-[color:var(--sf-text)]/70">
                <span className="whitespace-nowrap">Block: {currentBlock || '...'}</span>
                <span className="hidden sm:inline">•</span>
                <span className="whitespace-nowrap">{futures.length} active futures</span>
                {loading && (
                  <>
                    <span className="hidden sm:inline">•</span>
                    <span>Loading...</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleGenerateFuture}
                  disabled={loading}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-[color:var(--sf-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                  title="Generate a new future on regtest (requires local node)"
                >
                  Generate Future
                </button>
              </div>

              {/* Row 2: Markets/Positions tabs and Refresh button */}
              <div className="flex items-center gap-3">
                <FuturesHeaderTabs activeTab={activeTab} onTabChange={setActiveTab} />
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={loading || isRefreshing}
                  className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 disabled:opacity-50"
                  title="Refresh futures data"
                >
                  <RefreshCw size={20} className={loading || isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          }
          howItWorksButton={
            <div
              className="relative group"
              onMouseEnter={() => setShowHowItWorks(true)}
              onMouseLeave={() => setShowHowItWorks(false)}
            >
              <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                aria-label="How it works"
              >
                <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M176,232a8,8,0,0,1-8,8H88a8,8,0,0,1,0-16h80A8,8,0,0,1,176,232Zm40-128a87.55,87.55,0,0,1-33.64,69.21A16.24,16.24,0,0,0,176,186v6a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16v-6a16,16,0,0,0-6.23-12.66A87.59,87.59,0,0,1,40,104.49C39.74,56.83,78.26,17.14,125.88,16A88,88,0,0,1,216,104Zm-16,0a72,72,0,0,0-73.74-72c-39,.92-70.47,33.39-70.26,72.39a71.65,71.65,0,0,0,27.64,56.3A32,32,0,0,1,96,186v6h24V147.31L90.34,117.66a8,8,0,0,1,11.32-11.32L128,132.69l26.34-26.35a8,8,0,0,1,11.32,11.32L136,147.31V192h24v-6a32.12,32.12,0,0,1,12.47-25.35A71.65,71.65,0,0,0,200,104Z"/>
                </svg>
              </button>
              {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
            </div>
          }
        />
      }>
        {activeTab === 'markets' ? (
          <>
            {/* Data Source Banner */}
            {futures.length === 0 && !loading && (
              <div className="rounded-lg border border-red-900/30 bg-red-900/10 p-3 sm:p-4 mb-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-800 flex-shrink-0 mt-0.5 sm:w-5 sm:h-5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <div className="text-sm sm:text-base font-semibold text-[color:var(--sf-no-futures-title)] mb-1">No Futures Found</div>
                    <div className="text-xs sm:text-sm text-[color:var(--sf-no-futures-text)]/80">
                      No deployed futures detected. Click "Generate Future" to create one.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {futures.length > 0 && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 sm:p-4 mb-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500 flex-shrink-0 mt-0.5 sm:w-5 sm:h-5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <div>
                    <div className="text-sm sm:text-base font-semibold text-green-200 mb-1">Live Blockchain Data</div>
                    <div className="text-xs sm:text-sm text-green-200/80">
                      Showing {futures.length} future{futures.length === 1 ? '' : 's'} from block {currentBlock}.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section 1: Open Position Form */}
            <OpenPositionForm contracts={contracts} onContractSelect={handleContractSelect} />

            {/* Section 3: Active Markets Table */}
            <MarketsTable contracts={contracts} onContractSelect={setSelectedContract} />

            {/* Section 4: Contract Detail Modal */}
            {selectedContract && contractData && (
              <ContractDetailModal
                contractId={contractData.id}
                blocksLeft={contractData.blocksLeft}
                data={contractData}
                onClose={() => setSelectedContract(null)}
              />
            )}
          </>
        ) : (
          <PositionsSection />
        )}
      </AlkanesMainWrapper>
    </PageContent>
  );
}
