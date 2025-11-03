'use client';

import { useState, useEffect } from 'react';
import { SwapComponent } from './SwapComponent';
import { LPComponent } from './LPComponent';
import { Button } from "@/components/ui/button";
import { Settings } from 'lucide-react';
import { SwapSettingsModal } from './SwapSettingsModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { SwapSubfrostP2PTable } from './SwapSubfrostP2PTable';
import { useSubfrostP2P } from '@/context/SubfrostP2PContext';
import { SwapFlowCard } from './SwapFlowCard';
import { TradeFlowNav } from './TradeFlowNav';

export function SwapView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState(5); // Default 5%
  const [activeTab, setActiveTab] = useState('swap');
  const [currentBlock, setCurrentBlock] = useState(700000);
  const { addTransaction, updateTransaction } = useSubfrostP2P();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBlock((prev) => prev + 1);
    }, 10000); // Increment block number every 10 seconds

    return () => clearInterval(timer);
  }, []);

  const handleSwapConfirm = (amount: string) => {
    const newTransaction = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount,
      status: 'Pending' as 'Pending' | 'Broadcast' | 'Complete',
      blockNumber: currentBlock,
    };
    addTransaction(newTransaction);

    // Simulate transaction phases
    setTimeout(() => {
      updateTransaction({
        ...newTransaction,
        status: 'Broadcast' as 'Broadcast',
        blockNumber: currentBlock + 1,
      });
      setTimeout(() => {
        updateTransaction({
          ...newTransaction,
          status: 'Complete' as 'Complete',
          txid: Math.random().toString(16).slice(2, 10),
        });
      }, 10000);
    }, 10000);
  };

  const handleBurnConfirm = (amount: string) => {
    handleSwapConfirm(amount); // Reuse the same logic for BTC output from LP burning
  };

  return (
    <div className="space-y-6 flex flex-col items-center">
      <SwapFlowCard>
        <TradeFlowNav title="Swap" />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="swap"
              className="retro-text data-[state=active]:bg-[#284372] data-[state=active]:text-white"
            >
              Swap
            </TabsTrigger>
            <TabsTrigger
              value="lp"
              className="retro-text data-[state=active]:bg-[#284372] data-[state=active]:text-white"
            >
              <span className="text-[10px] sm:text-xs px-0.5 sm:px-1 whitespace-nowrap">LP</span>
            </TabsTrigger>
          </TabsList>
          <Separator className="my-2" />
          <TabsContent value="swap">
            <SwapComponent
              slippage={slippage}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onSwapConfirm={handleSwapConfirm}
            />
          </TabsContent>
          <TabsContent value="lp">
            <LPComponent
              slippage={slippage}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onBurnConfirm={handleBurnConfirm}
            />
          </TabsContent>
        </Tabs>
      </SwapFlowCard>
      <SwapSubfrostP2PTable currentBlock={currentBlock} />
      <SwapSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
      />
    </div>
  );
}