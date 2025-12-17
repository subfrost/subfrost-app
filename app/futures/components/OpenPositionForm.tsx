'use client';

import { useState, useMemo } from 'react';
import { calculateProfitAtLockPeriod } from '../utils/calculations';
import { type Contract } from '../data/mockContracts';
import TokenIcon from '@/app/components/TokenIcon';
import NumberField from '@/app/components/NumberField';
import { useBtcBalance } from '@/hooks/useBtcBalance';

type OpenPositionFormProps = {
  contracts: Contract[];
  onContractSelect?: (contractId: string, blocksLeft: number) => void;
};

type PayoutMarker = {
  blocksUntil: number; // How many blocks until this payout
  contractId: string;
  payoutAmount: number; // BTC (profit)
  yieldPercent: number;
  totalPayout: number; // Total BTC at this point (exercise value)
  investmentAmount: number; // BTC invested in this contract
};

export default function OpenPositionForm({ contracts, onContractSelect }: OpenPositionFormProps) {
  const [selectedBlocks, setSelectedBlocks] = useState<number>(30);
  const [investmentAmount, setInvestmentAmount] = useState<string>('1.0');
  
  // Get BTC balance
  const { data: btcBalanceSats } = useBtcBalance();
  const btcBalance = btcBalanceSats ? Number(btcBalanceSats) / 1e8 : 0;
  const balanceText = `Balance ${btcBalance.toFixed(6)}`;
  
  // Calculate balance usage percentage
  const calculateBalanceUsage = (): number => {
    if (!investmentAmount || btcBalance === 0) return 0;
    const amount = parseFloat(investmentAmount);
    if (!amount) return 0;
    const percentage = (amount / btcBalance) * 100;
    return Math.min(100, Math.max(0, percentage));
  };
  
  const balanceUsage = calculateBalanceUsage();
  
  // Color based on usage
  const getBalanceColor = () => {
    if (balanceUsage === 0) return 'bg-gray-200';
    if (balanceUsage < 50) return 'bg-green-500';
    if (balanceUsage < 80) return 'bg-yellow-500';
    if (balanceUsage < 100) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  // Handle percentage clicks
  const handlePercent = (percent: number) => {
    const amount = (btcBalance * percent).toFixed(8);
    setInvestmentAmount(amount);
  };
  
  // Handle max click
  const handleMax = () => {
    if (btcBalance > 0) {
      setInvestmentAmount(btcBalance.toFixed(8));
    }
  };

  // Calculate maximum blocks left among available contracts
  const maxBlocksLeft = contracts
    .filter((contract) => contract.remaining > 0)
    .reduce((max, contract) => Math.max(max, contract.blocksLeft), 0);

  // Use 1 as minimum if no contracts available, otherwise use the calculated max
  const maxPeriod = maxBlocksLeft > 0 ? maxBlocksLeft : 1;

  // Find minimum lock period that gives positive yield (>= 0%)
  const findMinimumProfitablePeriod = (): number => {
    const investment = parseFloat(investmentAmount) || 1.0;
    
    // Check periods from 1 to maxPeriod blocks
    for (let period = 1; period <= maxPeriod; period++) {
      const hasProfitableContract = contracts
        .filter((contract) => contract.remaining > 0)
        .some((contract) => {
          const ftrBtcNeeded = investment / contract.marketPriceNum;
          const availableFtrBtc = contract.remaining;
          const hasEnoughSupply = availableFtrBtc >= ftrBtcNeeded;
          const actualInvestmentAmount = hasEnoughSupply 
            ? investment 
            : availableFtrBtc * contract.marketPriceNum;
          
          const profitData = calculateProfitAtLockPeriod(
            contract.marketPriceNum,
            actualInvestmentAmount,
            period,
            contract.blocksLeft
          );
          
          return profitData.yieldPercent >= 0;
        });
      
      if (hasProfitableContract) {
        return period;
      }
    }
    
    // If no profitable period found, return maximum
    return maxPeriod;
  };

  // Calculate aggregated yield and payout timeline
  const { aggregatedYield, payoutMarkers, totalInvestment, totalProfit, totalPayout, maxBlocksUntil } = useMemo(() => {
    const totalInvestmentAmount = parseFloat(investmentAmount) || 1.0;
    
    // First, calculate yield for each contract to determine priority
    const contractYields = contracts
      .filter((contract) => contract.remaining > 0)
      .map((contract) => {
        // Calculate yield for a small test investment to determine profitability
        const testInvestment = 0.01; // Small test amount
        const profitData = calculateProfitAtLockPeriod(
          contract.marketPriceNum,
          testInvestment,
          selectedBlocks,
          contract.blocksLeft
        );
        
        return {
          ...contract,
          estimatedYieldPercent: profitData.yieldPercent,
        };
      })
      .filter((contract) => contract.estimatedYieldPercent >= 0)
      // Sort by yield descending (best first)
      .sort((a, b) => b.estimatedYieldPercent - a.estimatedYieldPercent);
    
    // Distribute total investment optimally across contracts
    let remainingInvestment = totalInvestmentAmount;
    const contractsWithYield: Array<{
      contract: typeof contracts[0];
      investmentAmount: number;
      profitData: ReturnType<typeof calculateProfitAtLockPeriod>;
      ftrBtcAmount: number;
    }> = [];
    
    for (const contractData of contractYields) {
      if (remainingInvestment <= 0) break;
      
      const contract = contractData;
      
      // Calculate how much we can invest in this contract
      const availableFtrBtc = contract.remaining;
      const maxInvestmentInContract = availableFtrBtc * contract.marketPriceNum;
      
      // Invest as much as possible, but not more than remaining total investment
      const investmentInContract = Math.min(remainingInvestment, maxInvestmentInContract);
      
      // Skip if investment is too small (less than 0.001 BTC)
      if (investmentInContract < 0.001) continue;
      
      // Calculate profit for this specific investment
      const profitData = calculateProfitAtLockPeriod(
        contract.marketPriceNum,
        investmentInContract,
        selectedBlocks,
        contract.blocksLeft
      );
      
      const ftrBtcAmount = investmentInContract / contract.marketPriceNum;
      
      contractsWithYield.push({
        contract,
        investmentAmount: investmentInContract,
        profitData,
        ftrBtcAmount,
      });
      
      remainingInvestment -= investmentInContract;
    }

    // Calculate aggregated metrics
    const totalInv = contractsWithYield.reduce((sum, c) => sum + c.investmentAmount, 0);
    const totalProf = contractsWithYield.reduce((sum, c) => sum + c.profitData.profit, 0);
    const totalPay = contractsWithYield.reduce((sum, c) => sum + c.profitData.exerciseValue, 0);
    
    // Weighted average yield
    const weightedYield = contractsWithYield.length > 0 && totalInv > 0
      ? contractsWithYield.reduce((sum, c) => sum + (c.profitData.yieldPercent * c.investmentAmount), 0) / totalInv
      : 0;

    // Create payout markers (when each contract can be exercised)
    // Payout happens when contract expires OR after lock period, whichever comes first
    const markers: PayoutMarker[] = contractsWithYield.map((item) => {
      const contract = item.contract;
      // Calculate when payout can happen
      // If contract expires before lock period ends, payout is at expiry
      // Otherwise, payout is after lock period
      const blocksUntil = Math.min(contract.blocksLeft, selectedBlocks);
      
      // Recalculate profit for the actual payout time
      const actualPayoutData = calculateProfitAtLockPeriod(
        contract.marketPriceNum,
        item.investmentAmount,
        blocksUntil, // Use actual blocks until payout
        contract.blocksLeft
      );
      
      return {
        blocksUntil,
        contractId: contract.id,
        payoutAmount: actualPayoutData.profit,
        yieldPercent: actualPayoutData.yieldPercent,
        totalPayout: actualPayoutData.exerciseValue,
        investmentAmount: item.investmentAmount,
      };
    });

    // Sort markers by blocks until payout
    markers.sort((a, b) => a.blocksUntil - b.blocksUntil);
    
    // Find maximum blocks until payout for scale positioning
    const maxBlocksUntil = markers.length > 0 
      ? Math.max(...markers.map(m => m.blocksUntil), selectedBlocks)
      : selectedBlocks;

    return {
      aggregatedYield: weightedYield,
      payoutMarkers: markers,
      totalInvestment: totalInv,
      totalProfit: totalProf,
      totalPayout: totalPay,
      maxBlocksUntil,
    };
  }, [contracts, investmentAmount, selectedBlocks]);

  // Validate if form can be submitted
  const canBuy = useMemo(() => {
    const amount = parseFloat(investmentAmount);
    return (
      amount > 0 &&
      isFinite(amount) &&
      selectedBlocks > 0 &&
      payoutMarkers.length > 0 &&
      totalInvestment > 0
    );
  }, [investmentAmount, selectedBlocks, payoutMarkers.length, totalInvestment]);

  const handleBuy = () => {
    if (!canBuy) return;
    // TODO: Implement buy logic
    console.log('Buy clicked', {
      investmentAmount,
      selectedBlocks,
      payoutMarkers,
      totalInvestment,
      totalProfit,
    });
  };

  return (
    <div className="mb-6">
      {/* 2-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side: User Inputs */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 space-y-6">
          {/* Investment Amount */}
          <div className="space-y-3">
            <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
              Investment Amount
            </label>
            <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] p-3 focus-within:ring-2 focus-within:ring-[color:var(--sf-primary)]/50 focus-within:border-[color:var(--sf-primary)] transition-all">
              <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="flex items-center gap-3">
                  <TokenIcon symbol="BTC" id="btc" size="md" network="mainnet" className="flex-shrink-0" />
                  <div className="flex-1">
                    <NumberField
                      value={investmentAmount}
                      onChange={setInvestmentAmount}
                      placeholder="1.0"
                      align="left"
                    />
                  </div>
                </div>
                <div className="text-right">
                  <div className="mb-2">
                    <div className="text-xs font-medium text-[color:var(--sf-text)]/60 mb-1">
                      {balanceText}
                      {balanceUsage > 0 && (
                        <span className="ml-1.5 text-[10px] font-bold">
                          ({balanceUsage.toFixed(1)}%)
                        </span>
                      )}
                    </div>
                    {balanceUsage > 0 && (
                      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${getBalanceColor()} transition-all duration-300 ease-out`}
                          style={{ width: `${balanceUsage}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePercent(0.25)}
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all focus:outline-none border border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercent(0.5)}
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all focus:outline-none border border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercent(0.75)}
                      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all focus:outline-none border border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"
                    >
                      75%
                    </button>
                    <button
                      type="button"
                      onClick={handleMax}
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-all border border-[color:var(--sf-primary)]/30 bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/20 hover:border-[color:var(--sf-primary)]/50"
                      disabled={btcBalance === 0}
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
              Enter the amount of BTC you want to invest
            </div>
          </div>

          {/* Lock Period Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
                Lock Period (blocks)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const minPeriod = findMinimumProfitablePeriod();
                    setSelectedBlocks(minPeriod);
                  }}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-all focus:outline-none border border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"
                >
                  Min
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBlocks(maxPeriod)}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-all focus:outline-none border border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10 hover:border-[color:var(--sf-primary)]/40"
                >
                  Max
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="1"
                max={maxPeriod}
                value={selectedBlocks}
                onChange={(e) => setSelectedBlocks(parseInt(e.target.value, 10))}
                className="flex-1 h-2 rounded-lg appearance-none bg-[color:var(--sf-glass-border)] cursor-pointer accent-[color:var(--sf-primary)]"
              />
              <div className="flex items-center gap-2 min-w-[120px]">
                <input
                  type="number"
                  min="1"
                  max={maxPeriod}
                  value={selectedBlocks}
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10) || 1;
                    setSelectedBlocks(Math.max(1, Math.min(maxPeriod, value)));
                  }}
                  className="h-10 w-20 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 text-sm font-semibold text-[color:var(--sf-text)] text-center outline-none focus:border-[color:var(--sf-primary)] transition-colors"
                />
                <span className="text-sm text-[color:var(--sf-text)]/70">blocks</span>
              </div>
            </div>
            <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
              Select how long you want to lock your position (1-{maxPeriod} blocks)
            </div>
          </div>

          {/* Buy Button */}
          <button
            type="button"
            onClick={handleBuy}
            disabled={!canBuy}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            Buy ftrBTC
          </button>
        </div>

        {/* Right Side: Auto-calculated Values */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 space-y-6">
          {payoutMarkers.length > 0 ? (
            <>
              {/* Total Yield Card */}
              <div className="rounded-lg border border-[color:var(--sf-glass-border)] bg-gradient-to-br from-[color:var(--sf-glass-bg)] to-[color:var(--sf-glass-bg)]/50 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-[color:var(--sf-text)]/70 mb-1">Total Yield</div>
                    <div className={`text-3xl font-bold ${aggregatedYield >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
                      {aggregatedYield >= 0 ? '+' : ''}{aggregatedYield.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-[color:var(--sf-text)]/70 mb-1">Total Profit</div>
                    <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
                      {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(6)} BTC
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[color:var(--sf-glass-border)]">
                  <div>
                    <div className="text-xs text-[color:var(--sf-text)]/70 mb-1">Investment (BTC)</div>
                    <div className="text-lg font-semibold text-[color:var(--sf-text)]">
                      {totalInvestment.toFixed(8)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[color:var(--sf-text)]/70 mb-1">Total Payout (BTC)</div>
                    <div className="text-lg font-semibold text-[color:var(--sf-text)]">
                      {totalPayout.toFixed(8)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[color:var(--sf-text)]/70 mb-1">Contracts</div>
                    <div className="text-lg font-semibold text-[color:var(--sf-text)]">
                      {payoutMarkers.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payout Timeline */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
                    Payout Timeline
                  </div>
                  <div className="text-xs text-[color:var(--sf-text)]/60">
                    {payoutMarkers.length} payout{payoutMarkers.length !== 1 ? 's' : ''}
                    {payoutMarkers.length > 0 && (
                      <span>
                        {' '}• {payoutMarkers[0].blocksUntil} - {maxBlocksUntil} blocks
                      </span>
                    )}
                  </div>
                </div>

                {/* Timeline Scale */}
                <div className="relative py-8">
                  {/* Background scale line */}
                  <div className="h-2 bg-[color:var(--sf-glass-border)] rounded-full relative">
                    {/* Current position indicator (Now) */}
                    <div 
                      className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[color:var(--sf-primary)] border-2 border-[color:var(--sf-glass-bg)] z-30"
                      style={{ left: '0%', marginLeft: '-8px' }}
                    />

                    {/* Payout markers */}
                    {payoutMarkers.map((marker, index) => {
                      // Fixed scale: 0 blocks = 0%, 95 blocks = 100%
                      const TIMELINE_MAX_BLOCKS = 95;
                      const position = (marker.blocksUntil / TIMELINE_MAX_BLOCKS) * 100;
                      
                      // Vertical offset for overlapping markers
                      const samePositionMarkers = payoutMarkers.filter(m => m.blocksUntil === marker.blocksUntil);
                      const samePositionIndex = samePositionMarkers.findIndex(m => m.contractId === marker.contractId);
                      const verticalOffset = samePositionMarkers.length > 1 
                        ? (samePositionIndex - (samePositionMarkers.length - 1) / 2) * 10 
                        : 0;
                      
                      return (
                        <div
                          key={`${marker.contractId}-${index}`}
                          className="absolute top-1/2 -translate-y-1/2 z-20 group"
                          style={{ 
                            left: `${Math.min(position, 100)}%`, 
                            marginLeft: '-8px',
                            transform: `translateY(${verticalOffset}px)`,
                          }}
                        >
                          {/* Marker dot */}
                          <div className="w-4 h-4 rounded-full bg-blue-400 border-2 border-[color:var(--sf-glass-bg)] shadow-lg cursor-pointer hover:scale-125 transition-transform">
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                              <div className="bg-[color:var(--sf-glass-bg)] border border-[color:var(--sf-glass-border)] rounded-lg p-2 shadow-lg whitespace-nowrap text-xs">
                                <div className="font-medium text-[color:var(--sf-text)]">{marker.contractId}</div>
                                <div className="text-[color:var(--sf-text)]/70">Investment: {marker.investmentAmount.toFixed(6)} BTC</div>
                                <div className="text-[color:var(--sf-text)]/70">Profit: {marker.payoutAmount >= 0 ? '+' : ''}{marker.payoutAmount.toFixed(6)} BTC</div>
                                <div className="text-[color:var(--sf-text)]/70">Yield: {marker.yieldPercent >= 0 ? '+' : ''}{marker.yieldPercent.toFixed(2)}%</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Timeline axis labels - positioned at the ends */}
                  <div className="absolute left-0 right-0 top-0 flex items-center justify-between text-xs">
                    {/* Left: Now */}
                    <div className="flex flex-col items-start">
                      <div className="font-medium text-[color:var(--sf-text)]">Now</div>
                      <div className="text-[color:var(--sf-text)]/50 text-[10px]">0 blocks</div>
                    </div>
                    
                    {/* Right: Max (fixed at 95 blocks) */}
                    <div className="flex flex-col items-end">
                      <div className="font-medium text-blue-400">Payout</div>
                      <div className="text-[color:var(--sf-text)]/50 text-[10px]">95 blocks</div>
                    </div>
                  </div>

                  {/* Payout summary cards */}
                  <div className="mt-6 space-y-2">
                    {payoutMarkers.map((marker, index) => (
                      <div
                        key={`summary-${marker.contractId}-${index}`}
                        className="rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)]/50 p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                          <div>
                            <div className="text-sm font-medium text-[color:var(--sf-text)]">{marker.contractId}</div>
                            <div className="text-xs text-[color:var(--sf-text)]/60">
                              {marker.investmentAmount.toFixed(6)} BTC • In {marker.blocksUntil} blocks
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${marker.yieldPercent >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
                            {marker.yieldPercent >= 0 ? '+' : ''}{marker.yieldPercent.toFixed(2)}%
                          </div>
                          <div className="text-xs text-[color:var(--sf-text)]/60">
                            {marker.payoutAmount >= 0 ? '+' : ''}{marker.payoutAmount.toFixed(6)} BTC
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-center py-8 text-[color:var(--sf-text)]/60">
              <div>
                No profitable contracts available for {selectedBlocks} blocks lock period.
                <div className="text-xs mt-2">Try selecting a shorter period or check back later.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
