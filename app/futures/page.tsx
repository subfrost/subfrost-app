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
      await generateFuture('http://localhost:18443');
      alert('Future generated successfully! Check the Markets table.');
    } catch (err) {
      alert(`Failed to generate future: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
              className="flex items-center justify-center w-6 h-6 rounded-full border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)]/70 hover:text-[color:var(--sf-text)] hover:bg-white/50 transition-colors cursor-help"
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
                className="px-4 py-2 text-xs font-bold tracking-[0.08em] uppercase rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Generate a new future on regtest (requires local node)"
              >
                Generate Future
              </button>
              <FuturesHeaderTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
          }
        />
      }>
        {activeTab === 'markets' ? (
          <>
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
