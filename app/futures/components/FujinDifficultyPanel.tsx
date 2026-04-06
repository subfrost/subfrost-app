'use client';

import { useState, useMemo, useCallback } from 'react';
import { useFujinMarkets } from '@/hooks/useFujinMarkets';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { computeSwapZapQuote, formatTokenAmount } from '@/lib/fujin/swap-math';

const EPOCH_LENGTH = 2016;
const DIFFICULTY_CAP = 100;

function formatDifficulty(diff: number): string {
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(2)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(2)}G`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(2)}M`;
  return diff.toFixed(0);
}

export default function FujinDifficultyPanel() {
  const { data: fujinData, isLoading: fujinLoading } = useFujinMarkets();
  const { isConnected, network, account } = useWallet();
  const queryClient = useQueryClient();
  const [swapDirection, setSwapDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [amount, setAmount] = useState('');
  const [buying, setBuying] = useState(false);
  const taprootAddress = account?.taproot?.address;
  const segwitAddress = account?.nativeSegwit?.address;

  const isLocal = network === 'regtest-local' || network === 'devnet';
  const directRpcUrl = isLocal ? 'http://localhost:18888' : getRpcUrl(network);

  // DIESEL balance via protobuf
  const { data: dieselBalanceRaw } = useQuery({
    queryKey: ['fujin-diesel-balance', taprootAddress, network],
    enabled: !!taprootAddress && !!network,
    staleTime: 10_000,
    queryFn: async () => {
      if (!taprootAddress) return 0n;
      const addrBuf = new TextEncoder().encode(taprootAddress);
      const parts = [0x0a, addrBuf.length, ...addrBuf, 0x12, 0x02, 0x08, 0x01];
      const hex = '0x' + Array.from(parts, b => b.toString(16).padStart(2, '0')).join('');
      const res = await fetch(directRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'metashrew_view', params: ['protorunesbyaddress', hex, 'latest'] }),
      });
      const json = await res.json();
      if (!json.result || json.result.length <= 4) return 0n;
      const { parseProtorunesResponse } = await import('@/queries/account');
      const map = parseProtorunesResponse(json.result);
      return map.get('2:0') || 0n;
    },
  });
  const dieselBalance = dieselBalanceRaw || 0n;

  // Block height + difficulty
  const { data: chainData } = useQuery({
    queryKey: ['fujin-chain-data', network],
    enabled: !!network,
    staleTime: 10_000,
    queryFn: async () => {
      const rpc = async (method: string, params: any[] = []) => {
        const res = await fetch(directRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        return json.result;
      };
      const height = await rpc('btc_getblockcount');
      let difficulty = 0;
      let difficultyChange = 0;
      try {
        const hash = await rpc('btc_getblockhash', [height]);
        const header = await rpc('btc_getblockheader', [hash]);
        difficulty = header?.difficulty ?? 0;
        const blocksSinceRetarget = height % EPOCH_LENGTH;
        if (blocksSinceRetarget >= 10) {
          const periodStart = Math.floor(height / EPOCH_LENGTH) * EPOCH_LENGTH;
          const startHash = await rpc('btc_getblockhash', [periodStart]);
          const startHeader = await rpc('btc_getblockheader', [startHash]);
          const actualTime = header.time - startHeader.time;
          const avgBlockTime = actualTime / blocksSinceRetarget;
          difficultyChange = ((EPOCH_LENGTH * 600 / (avgBlockTime * EPOCH_LENGTH)) - 1) * 100;
        }
      } catch {}
      return { height, difficulty, difficultyChange };
    },
  });
  const blockHeight = chainData?.height as number | undefined;

  // Active market
  const activeMarket = useMemo(() => {
    if (!fujinData?.markets?.length) return null;
    return fujinData.markets[0];
  }, [fujinData]);

  // Reserves
  const longReserve = activeMarket?.reserves?.long || 0n;
  const shortReserve = activeMarket?.reserves?.short || 0n;
  const totalReserves = longReserve + shortReserve;

  // Prices from reserves
  const longPrice = totalReserves > 0n ? Number(shortReserve) / Number(totalReserves) : 0;
  const impliedDiffChange = (longPrice - 0.5) * 2 * DIFFICULTY_CAP;

  // Pool TVL
  const poolTvlDiesel = totalReserves > 0n ? (2n * longReserve * shortReserve) / totalReserves : 0n;

  // Settlement from pool endHeight
  const settlementInfo = useMemo(() => {
    if (!activeMarket?.endHeight || typeof blockHeight !== 'number') return null;
    const endH = activeMarket.endHeight;
    const blocksRemaining = Math.max(0, endH - blockHeight);
    const epochLen = activeMarket.epochLength || EPOCH_LENGTH;
    const blocksElapsed = epochLen - blocksRemaining;
    const progress = epochLen > 0 ? Math.min(100, Math.round((blocksElapsed / epochLen) * 100)) : 0;
    const minutesRemaining = blocksRemaining * 10;
    const settlementDate = blocksRemaining > 0 ? new Date(Date.now() + minutesRemaining * 60 * 1000) : null;
    const days = minutesRemaining / (60 * 24);
    const timeLabel = days >= 1 ? `${days.toFixed(0)}d ${Math.round((days % 1) * 24)}h` : `${Math.round(minutesRemaining / 60)}h`;
    return { blocksRemaining, blocksElapsed, epochLen, progress, timeLabel, settlementDate };
  }, [activeMarket, blockHeight]);

  // Swap quote (client-side, no RPC needed)
  const dieselSats = amount ? BigInt(Math.floor(parseFloat(amount || '0') * 1e8)) : 0n;
  const quote = dieselSats > 0n && totalReserves > 0n
    ? computeSwapZapQuote(dieselSats, swapDirection, longReserve, shortReserve)
    : null;

  // Quote display values (from instruction)
  const effectivePrice = quote ? Number(dieselSats) / Number(quote.expectedOutput) : 0;
  const breakeven = quote
    ? (swapDirection === 'LONG'
        ? (effectivePrice - 0.5) * 2 * DIFFICULTY_CAP
        : (0.5 - effectivePrice) * 2 * DIFFICULTY_CAP)
    : null;
  const multiplier = quote ? Number(quote.expectedOutput) / Number(dieselSats) : 0;

  // Buy LONG/SHORT via zap contract — same pattern as fuboku useAlkanesExecute
  const handleBuy = useCallback(async () => {
    if (!quote || !activeMarket || dieselSats <= 0n || !taprootAddress) return;
    setBuying(true);
    try {
      const config = getConfig(network || 'regtest-local');
      const zapId = (config as any).FUJIN_ZAP_ID;
      if (!zapId) throw new Error('Zap contract not configured');

      const [zapBlock, zapTx] = zapId.split(':');
      const poolBlock = activeMarket.pool.block;
      const poolTx = activeMarket.pool.tx;
      const opcode = swapDirection === 'LONG' ? 4 : 5;
      const minOut = quote.minimumReceived;

      const protostone = `[${zapBlock},${zapTx},${opcode},${poolBlock},${poolTx},${minOut},0]:v0:v0`;
      const inputRequirements = `2:0:${dieselSats}`;

      // Create dedicated provider with mnemonic loaded (like fuboku useAlkanesExecute).
      // Use 'regtest' preset — same as fuboku.
      const wasm = await import('@alkanes/ts-sdk/wasm');
      // Use 'mainnet' preset with regtest URLs — mainnet preset gives coinType=0
      // which matches subfrost's createWalletFromMnemonic addresses.
      // TODO: migrate WalletContext to AlkanesClient.withMnemonic (coinType=1 for regtest)
      // then switch this to 'regtest' preset.
      const execProvider = new wasm.WebProvider('mainnet', {
        jsonrpc_url: directRpcUrl,
        data_api_url: directRpcUrl,
      });
      const sessionMnemonic = sessionStorage.getItem('subfrost_session_mnemonic') || '';
      if (!sessionMnemonic) throw new Error('Wallet not unlocked');
      execProvider.walletLoadMnemonic(sessionMnemonic, null);

      const fromAddrs = [taprootAddress];
      if (segwitAddress && segwitAddress !== taprootAddress) fromAddrs.push(segwitAddress);
      const result = await execProvider.alkanesExecuteFull(
        JSON.stringify([taprootAddress]),
        inputRequirements,
        protostone,
        1,
        null,
        JSON.stringify({
          from: fromAddrs,
          change_address: segwitAddress || taprootAddress,
          alkanes_change_address: taprootAddress,
          mine_enabled: true,
          auto_confirm: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const txid = parsed?.txid || parsed?.reveal_txid || '';
      if (txid) {
        window.alert(`Buy ${swapDirection} successful! TX: ${txid.slice(0, 16)}...`);
      }

      setAmount('');
      queryClient.invalidateQueries().catch(() => {});
    } catch (err: any) {
      console.error('[FujinBuy] Error:', err);
      window.alert(`Buy failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBuying(false);
    }
  }, [quote, activeMarket, dieselSats, swapDirection, network, taprootAddress, segwitAddress, directRpcUrl, queryClient]);

  // Percentage buttons
  const handlePct = (pct: number) => {
    if (dieselBalance > 0n) {
      const amt = (dieselBalance * BigInt(pct)) / 100n;
      setAmount((Number(amt) / 1e8).toString());
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-3 gap-1">
        <h2 className="text-xs font-medium text-[color:var(--sf-text)]/50 uppercase tracking-wide">Difficulty Adjustment</h2>
        {settlementInfo && (
          <span className="text-xs text-[color:var(--sf-text)]/40">
            Settles in {settlementInfo.timeLabel}
            {settlementInfo.settlementDate && ` · ${settlementInfo.settlementDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </span>
        )}
      </div>

      {/* Hero Stats */}
      <div className="sf-card-small px-4 py-3 sm:px-6 sm:py-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-0 sm:grid-cols-4 sm:divide-x divide-[color:var(--sf-glass-border)]">
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Market Forecast</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {totalReserves > 0n ? `${impliedDiffChange >= 0 ? '+' : ''}${impliedDiffChange.toFixed(2)}%` : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">implied difficulty change</div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Difficulty</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {chainData?.difficulty ? formatDifficulty(chainData.difficulty) : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">
              {chainData?.difficultyChange
                ? `${chainData.difficultyChange >= 0 ? '+' : ''}${chainData.difficultyChange.toFixed(2)}% est. change`
                : '--'}
            </div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Settlement</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {settlementInfo ? `${settlementInfo.progress}%` : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">
              {settlementInfo
                ? `${settlementInfo.blocksElapsed.toLocaleString()} / ${settlementInfo.epochLen.toLocaleString()} blocks`
                : '--'}
            </div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Pool TVL</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {fujinLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : poolTvlDiesel > 0n ? formatTokenAmount(poolTvlDiesel, 8) : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">in DIESEL value</div>
          </div>
        </div>
      </div>

      {/* Swap Panel */}
      <div className="sf-card p-4 sm:p-6">
        <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg mb-4">
          <button
            onClick={() => setSwapDirection('LONG')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
              swapDirection === 'LONG' ? 'bg-green-600 text-white shadow-sm' : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" /> LONG
          </button>
          <button
            onClick={() => setSwapDirection('SHORT')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
              swapDirection === 'SHORT' ? 'bg-red-600 text-white shadow-sm' : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5" /> SHORT
          </button>
        </div>

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
                <button key={pct} onClick={() => handlePct(pct)} className="sf-percent-btn-pill hidden sm:block">{pct}%</button>
              ))}
              <button onClick={() => handlePct(100)} className="sf-percent-btn-pill">MAX</button>
            </div>
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            <span className="text-xs text-[color:var(--sf-text)]/40">Pay DIESEL</span>
            <span className="text-xs text-[color:var(--sf-text)]/40">Balance: {formatTokenAmount(dieselBalance, 8)}</span>
          </div>
        </div>

        {/* Quote */}
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${amount ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="p-4 mb-4 bg-[color:var(--sf-surface)] rounded-xl space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Receive</span>
                <span className="tabular-nums font-semibold text-[color:var(--sf-text)]">
                  {quote ? `${formatTokenAmount(quote.expectedOutput, 8)} ${swapDirection}` : `-- ${swapDirection}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Breakeven</span>
                <span className="tabular-nums text-[color:var(--sf-text)]">
                  {breakeven !== null ? `${breakeven >= 0 ? '+' : ''}${breakeven.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Max Payout</span>
                <span className="tabular-nums text-green-400">
                  {quote ? `${formatTokenAmount(quote.expectedOutput, 8)} DIESEL (${multiplier.toFixed(2)}x)` : '--'}
                </span>
              </div>
              {quote && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--sf-text)]/50">Fee</span>
                    <span className="tabular-nums text-[color:var(--sf-text)]/60">{formatTokenAmount(quote.feeAmount, 8)} DIESEL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--sf-text)]/50">Price Impact</span>
                    <span className="tabular-nums text-[color:var(--sf-text)]/60">{quote.priceImpact.toFixed(2)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleBuy}
          disabled={!isConnected || !amount || !quote || buying}
          className="sf-btn-primary w-full py-3.5"
        >
          {buying ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
          {!isConnected ? 'Connect Wallet' : buying ? 'Buying...' : `Buy ${swapDirection}`}
        </button>
      </div>
    </div>
  );
}
