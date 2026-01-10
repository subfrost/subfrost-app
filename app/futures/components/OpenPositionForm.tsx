'use client';

import { useState, useMemo, useRef } from 'react';
import { calculateProfitAtLockPeriod } from '../utils/calculations';
import { type Contract } from '../data/mockContracts';
import TokenIcon from '@/app/components/TokenIcon';
import NumberField from '@/app/components/NumberField';
import { useBtcBalance } from '@/hooks/useBtcBalance';
import { useWallet } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';

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
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get wallet connection state
  const { isConnected, onConnectModalOpenChange } = useWallet();
  const { theme } = useTheme();

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
    const isDark = theme === 'dark';
    if (balanceUsage === 0) return isDark ? 'bg-gray-700' : 'bg-gray-200';
    if (balanceUsage < 50) return isDark ? 'bg-green-700' : 'bg-green-500';
    if (balanceUsage < 80) return isDark ? 'bg-yellow-700' : 'bg-yellow-500';
    if (balanceUsage < 100) return isDark ? 'bg-orange-700' : 'bg-orange-500';
    return isDark ? 'bg-red-700' : 'bg-red-500';
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

  // Check if current amount matches a specific percentage of balance
  const getActivePercent = (): number | null => {
    if (!investmentAmount || btcBalance === 0) return null;

    const amount = parseFloat(investmentAmount);
    if (!amount) return null;

    const tolerance = 0.0001; // Small tolerance for floating point comparison
    if (Math.abs(amount - btcBalance * 0.25) < tolerance) return 0.25;
    if (Math.abs(amount - btcBalance * 0.5) < tolerance) return 0.5;
    if (Math.abs(amount - btcBalance * 0.75) < tolerance) return 0.75;
    if (Math.abs(amount - btcBalance) < tolerance) return 1;

    return null;
  };

  const activePercent = getActivePercent();

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
    // If not connected, open connect wallet modal
    if (!isConnected) {
      onConnectModalOpenChange(true);
      return;
    }

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
        <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 sm:p-9 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md space-y-6">
          {/* Investment Amount */}
          <div className="space-y-3">
            <div
              className={`relative rounded-xl bg-[color:var(--sf-input-bg)] p-4 transition-shadow duration-300 cursor-text ${inputFocused ? 'shadow-[0_0_20px_rgba(91,156,255,0.3),0_4px_20px_rgba(0,0,0,0.12)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.08)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)]'}`}
              onClick={() => inputRef.current?.focus()}
            >
              {/* Floating BTC icon */}
              <div
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <TokenIcon symbol="BTC" id="btc" size="md" network="mainnet" />
              </div>
              <div className="flex flex-col gap-1 pl-14">
                <span className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">Investment Amount</span>
                <NumberField
                  ref={inputRef}
                  value={investmentAmount}
                  onChange={setInvestmentAmount}
                  placeholder="1.0"
                  align="left"
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                />
                {/* Balance and percentage buttons row */}
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/40">
                    Enter BTC amount
                  </div>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handlePercent(0.25)}
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 0.25 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-[color:var(--sf-primary)]/10`}`}
                    >
                      25%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercent(0.5)}
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 0.5 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-[color:var(--sf-primary)]/10`}`}
                    >
                      50%
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePercent(0.75)}
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 0.75 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-[color:var(--sf-primary)]/10`}`}
                    >
                      75%
                    </button>
                    <button
                      type="button"
                      onClick={handleMax}
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] outline-none focus:outline-none text-[color:var(--sf-percent-btn)] ${activePercent === 1 ? "bg-[color:var(--sf-primary)]/20" : `${theme === 'dark' ? 'bg-white/[0.03]' : 'bg-[color:var(--sf-surface)]'} hover:bg-[color:var(--sf-primary)]/10`}`}
                      disabled={btcBalance === 0}
                    >
                      Max
                    </button>
                  </div>
                </div>
                {/* Balance row */}
                <div className="flex items-center justify-end gap-2">
                  <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                    {balanceText}
                    {balanceUsage > 0 && (
                      <span className="ml-1.5">
                        ({balanceUsage.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  {balanceUsage > 0 && (
                    <div className={`w-16 h-1.5 ${theme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                      <div
                        className={`h-full ${getBalanceColor()} transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none`}
                        style={{ width: `${balanceUsage}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
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
                  className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none border border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-percent-btn)] hover:bg-[color:var(--sf-primary)]/10"
                >
                  Min
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBlocks(maxPeriod)}
                  className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none focus:outline-none border border-[color:var(--sf-percent-btn)]/20 bg-[color:var(--sf-surface)] text-[color:var(--sf-percent-btn)] hover:bg-[color:var(--sf-primary)]/10"
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
                  className="h-10 w-20 rounded-lg bg-[color:var(--sf-input-bg)] px-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm font-semibold text-[color:var(--sf-text)] text-center outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
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
            disabled={isConnected && !canBuy}
            className="h-12 w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] font-bold text-white text-sm uppercase tracking-wider shadow-[0_4px_16px_rgba(0,0,0,0.3)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          >
            {isConnected ? 'Buy ftrBTC' : 'Connect Wallet'}
          </button>
        </div>

        {/* Right Side: Auto-calculated Values */}
        <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] p-6 sm:p-9 shadow-[0_4px_20px_rgba(0,0,0,0.2)] backdrop-blur-md space-y-6">
          {payoutMarkers.length > 0 ? (
            <>
              {/* Total Yield Card */}
              <div className="rounded-2xl bg-[color:var(--sf-panel-bg)] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_4px_20px_rgba(0,0,0,0.12)] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-[color:var(--sf-text)]/70 mb-1">Total Yield</div>
                    <div className={`text-3xl font-bold ${aggregatedYield >= 0 ? 'text-[color:var(--sf-primary)]' : 'text-red-500'}`}>
                      {aggregatedYield >= 0 ? '+' : ''}{aggregatedYield.toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-[color:var(--sf-text)]/70 mb-1">Total Profit</div>
                    <div className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-[color:var(--sf-primary)]' : 'text-red-500'}`}>
                      {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(6)} BTC
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4">
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
                          <div className="w-4 h-4 rounded-full bg-[color:var(--sf-primary)] border-2 border-[color:var(--sf-glass-bg)] shadow-lg cursor-pointer hover:scale-125 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">
                            {/* Tooltip on hover */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none z-50">
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
                      <div className="font-medium text-[color:var(--sf-primary)]">Payout</div>
                      <div className="text-[color:var(--sf-text)]/50 text-[10px]">95 blocks</div>
                    </div>
                  </div>

                  {/* Payout summary cards */}
                  <div className="mt-6 space-y-3">
                    {payoutMarkers.map((marker, index) => (
                      <div
                        key={`summary-${marker.contractId}-${index}`}
                        className="rounded-2xl bg-[color:var(--sf-surface)]/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-primary)]/10 focus:outline-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-transparent flex items-center justify-center">
                            <TokenIcon symbol="BTC" id="btc" size="md" network="mainnet" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <div className="truncate text-sm font-bold text-[color:var(--sf-text)]">{marker.contractId}</div>
                              <div className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${marker.yieldPercent >= 0 ? 'bg-[color:var(--sf-info-green-bg)] text-[color:var(--sf-info-green-title)]' : 'bg-red-500/20 text-red-500'}`}>
                                {marker.yieldPercent >= 0 ? '+' : ''}{marker.yieldPercent.toFixed(2)}%
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <div className="truncate text-xs text-[color:var(--sf-text)]/60">
                                {marker.investmentAmount.toFixed(6)} BTC • In {marker.blocksUntil} blocks
                              </div>
                              <div className="text-xs text-[color:var(--sf-text)]/60">
                                {marker.payoutAmount >= 0 ? '+' : ''}{marker.payoutAmount.toFixed(6)} BTC
                              </div>
                            </div>
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
