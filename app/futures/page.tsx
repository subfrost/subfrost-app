'use client';

import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageContent from '@/app/components/PageContent';
import PageHeader from '@/app/components/PageHeader';
import { useState } from 'react';
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

  // Mock contract data
  const contractData = selectedContract
    ? {
        id: selectedContract.id,
        blocksLeft: selectedContract.blocksLeft,
        expiryBlock: 982110,
        created: '6 blocks ago',
        underlyingYield: 'auto-compounding',
        vaultFreeCapital: 310,
        liquidityDepth: 21,
        dxBTCStatus: 'Healthy',
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
    try {
      await refetch();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
  };

  return (
    <PageContent>
      <AlkanesMainWrapper header={
        <PageHeader
          title="Coinbase Futures (ftrBTC)"
          subtitle={
            <div className="flex items-center gap-3 text-sm text-[color:var(--sf-text)]/70">
              <span>Block: {currentBlock || '...'}</span>
              <span>•</span>
              <span>{futures.length} active futures</span>
              {loading && (
                <>
                  <span>•</span>
                  <span>Loading...</span>
                </>
              )}
              {error && (
                <>
                  <span>•</span>
                  <span className="text-red-400">Error: {error}</span>
                </>
              )}
            </div>
          }
          howItWorksButton={
            <button
              type="button"
              onClick={() => setShowHowItWorks(true)}
              className="flex items-center justify-center w-6 h-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/50 transition-colors cursor-help"
              aria-label="How it works"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </button>
          }
          actions={
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleGenerateFuture}
                disabled={loading}
                className="px-4 py-2 text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-[color:var(--sf-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Generate a new future on regtest (requires local node)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                <span className="ml-2">Generate Future</span>
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="px-3 py-2 text-xs font-bold tracking-[0.08em] uppercase rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Refresh futures data"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline-block">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <span className="ml-2">Refresh</span>
              </button>
              <FuturesHeaderTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          }
        />
      }>
        {activeTab === 'markets' ? (
          <>
            {/* Data Source Banner */}
            {futures.length === 0 && !loading && (
              <div className="rounded-lg border border-red-900/30 bg-red-900/10 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-800 flex-shrink-0 mt-0.5">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <div>
                    <div className="font-semibold text-[color:var(--sf-no-futures-title)] mb-1">No Futures Found</div>
                    <div className="text-sm text-[color:var(--sf-no-futures-text)]/80">
                      No deployed futures detected on the blockchain. Click "Generate Future" to create one, or displaying mock data for demo purposes.
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {futures.length > 0 && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-500 flex-shrink-0 mt-0.5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  <div>
                    <div className="font-semibold text-green-200 mb-1">Live Blockchain Data</div>
                    <div className="text-sm text-green-200/80">
                      Showing {futures.length} real future{futures.length === 1 ? '' : 's'} from the blockchain at block {currentBlock}.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section 1: Open Position Form */}
            <OpenPositionForm contracts={contracts} onContractSelect={handleContractSelect} />

            {/* Section 3: Active Markets Table */}
            <MarketsTable contracts={contracts} onContractSelect={setSelectedContract} />

            {/* How It Works Modal */}
            {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}

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
