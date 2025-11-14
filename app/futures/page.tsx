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

type TabKey = 'markets' | 'positions';

export default function FuturesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('markets');
  const [selectedContract, setSelectedContract] = useState<{ id: string; blocksLeft: number } | null>(null);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

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

  return (
    <PageContent>
      <AlkanesMainWrapper header={
        <PageHeader
          title="Coinbase Futures (ftrBTC)"
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
          actions={<FuturesHeaderTabs activeTab={activeTab} onTabChange={setActiveTab} />}
        />
      }>
        {activeTab === 'markets' ? (
          <>
            {/* Section 1: Open Position Form */}
            <OpenPositionForm contracts={mockContracts} onContractSelect={handleContractSelect} />

            {/* Section 3: Active Markets Table */}
            <MarketsTable onContractSelect={setSelectedContract} />

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
