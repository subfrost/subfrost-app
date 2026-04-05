'use client';

import { useState, useMemo } from 'react';
import { useFujinMarkets } from '@/hooks/useFujinMarkets';
import { useWallet } from '@/context/WalletContext';
import { getRpcUrl } from '@/utils/getConfig';
import { useTranslation } from '@/hooks/useTranslation';
import { Info, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/keys';

/**
 * Fujin Difficulty Futures Panel
 *
 * Shows difficulty epoch info, LONG/SHORT positions.
 * Epoch info is derived from on-chain block height:
 * - Bitcoin difficulty adjusts every 2016 blocks
 * - Epoch progress = (blockHeight % 2016) / 2016
 * - Blocks remaining = 2016 - (blockHeight % 2016)
 */

const EPOCH_LENGTH = 2016;

function formatDifficulty(diff: number): string {
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}G`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  return diff.toFixed(0);
}

export default function FujinDifficultyPanel() {
  const { t } = useTranslation();
  const { data: fujinData, isLoading: fujinLoading } = useFujinMarkets();
  const { isConnected, network, account } = useWallet();
  const [swapDirection, setSwapDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [amount, setAmount] = useState('');
  const taprootAddress = account?.taproot?.address;

  // Fetch DIESEL (2:0) balance via alkanes_protorunesbyaddress (NOT dataApi which hangs on devnet)
  const { data: dieselBalance } = useQuery({
    queryKey: ['diesel-balance', taprootAddress, network],
    enabled: !!taprootAddress && !!network,
    staleTime: 10_000,
    queryFn: async () => {
      if (!taprootAddress) return '0';
      try {
        const rpcUrl = getRpcUrl(network);
        const resp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alkanes_protorunesbyaddress',
            params: [{ address: taprootAddress, protocolTag: '1' }],
            id: 1,
          }),
        });
        const json = await resp.json();
        let total = 0;
        for (const outpoint of json?.result?.outpoints || []) {
          const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
          for (const entry of balances) {
            if (parseInt(entry.block ?? '0') === 2 && parseInt(entry.tx ?? '0') === 0) {
              total += parseInt(entry.amount || '0');
            }
          }
        }
        return (total / 1e8).toFixed(2);
      } catch {}
      return '0';
    },
  });

  // Get current block height from the shared height query
  const { data: blockHeight } = useQuery({
    queryKey: queryKeys.height.espo(network || 'devnet'),
    enabled: !!network,
    staleTime: 8_000,
  });

  // Compute epoch info from block height
  const epochInfo = useMemo(() => {
    if (typeof blockHeight !== 'number' || blockHeight <= 0) return null;
    const blocksIntoEpoch = blockHeight % EPOCH_LENGTH;
    const progress = blocksIntoEpoch / EPOCH_LENGTH;
    const blocksRemaining = EPOCH_LENGTH - blocksIntoEpoch;
    // Estimated time remaining: ~10 min per block
    const minutesRemaining = blocksRemaining * 10;
    const daysRemaining = minutesRemaining / (60 * 24);

    let timeLabel: string;
    if (daysRemaining >= 1) {
      timeLabel = `~${daysRemaining.toFixed(0)} days left`;
    } else {
      const hoursRemaining = minutesRemaining / 60;
      timeLabel = `~${hoursRemaining.toFixed(0)} hours left`;
    }

    return {
      progress,
      progressPct: (progress * 100).toFixed(0),
      blocksRemaining,
      timeLabel,
      epochNumber: Math.floor(blockHeight / EPOCH_LENGTH),
    };
  }, [blockHeight]);

  // Pool TVL from fujin markets (number of markets as proxy)
  const poolTvl = useMemo(() => {
    if (!fujinData || fujinData.numMarkets === 0) return null;
    return `${fujinData.numMarkets} markets`;
  }, [fujinData]);

  return (
    <div className="space-y-4">
      {/* Hero Stats */}
      <div className="sf-card-small px-4 py-3 sm:px-6 sm:py-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-0 sm:grid-cols-4 sm:divide-x divide-[color:var(--sf-glass-border)]">
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Block Height</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {typeof blockHeight === 'number' ? blockHeight.toLocaleString() : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">
              {epochInfo ? `Epoch #${epochInfo.epochNumber}` : '--'}
            </div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Epoch Progress</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-primary)] tabular-nums">
              {epochInfo ? `${epochInfo.progressPct}%` : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">
              {epochInfo ? epochInfo.timeLabel : '--'}
            </div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Blocks Remaining</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {epochInfo ? epochInfo.blocksRemaining.toLocaleString() : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">Until next adjustment</div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Fujin Markets</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {fujinLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : poolTvl ?? '0'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">Active pools</div>
          </div>
        </div>
      </div>

      {/* Swap Panel -- LONG/SHORT */}
      <div className="sf-card p-4 sm:p-6">
        {/* Direction toggle */}
        <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg mb-4">
          <button
            onClick={() => setSwapDirection('LONG')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
              swapDirection === 'LONG'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            LONG
          </button>
          <button
            onClick={() => setSwapDirection('SHORT')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
              swapDirection === 'SHORT'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5" />
            SHORT
          </button>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <div className="flex rounded-xl overflow-hidden bg-[color:var(--sf-surface)]">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="sf-input flex-1 px-4 py-4 !bg-transparent text-2xl font-medium text-[color:var(--sf-text)] tabular-nums min-w-0 placeholder:text-[color:var(--sf-text)]/30 !rounded-none !shadow-none"
            />
            <div className="flex items-center gap-1 shrink-0 mr-3">
              {[25, 50, 75].map(pct => (
                <button
                  key={pct}
                  className="sf-percent-btn-pill hidden sm:block"
                >
                  {pct}%
                </button>
              ))}
              <button className="sf-percent-btn-pill">
                MAX
              </button>
            </div>
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            <span className="text-xs text-[color:var(--sf-text)]/40">Pay DIESEL</span>
            <span className="text-xs text-[color:var(--sf-text)]/40">Balance: {dieselBalance || '--'}</span>
          </div>
        </div>

        {/* Quote details (collapsed when no amount) */}
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          amount ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}>
          <div className="overflow-hidden">
            <div className="p-4 mb-4 bg-[color:var(--sf-surface)] rounded-xl space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Receive</span>
                <span className="tabular-nums font-semibold text-[color:var(--sf-text)]">
                  -- {swapDirection}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Breakeven</span>
                <span className="tabular-nums text-[color:var(--sf-text)]">--</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Max Payout</span>
                <span className="tabular-nums text-green-400">--</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          disabled={!isConnected || !amount}
          className="sf-btn-primary w-full py-3.5"
        >
          {isConnected ? `Buy ${swapDirection}` : 'Connect Wallet'}
        </button>
      </div>
    </div>
  );
}
