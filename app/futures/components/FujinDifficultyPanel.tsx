'use client';

import { useState, useMemo, useCallback } from 'react';
import { useFujinMarkets } from '@/hooks/useFujinMarkets';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { Loader2, TrendingUp, TrendingDown, X } from 'lucide-react';
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

  // All alkane balances at wallet address — single protobuf query
  // Canonical balance source: esplora_address::utxo + Promise.all
  // protorunesbyoutpoint per dust UTXO. `protorunesbyaddress` (the
  // address-keyed view) is forbidden — it carries phantom balances
  // for previously-spent outpoints. See queries/account.ts docs.
  const { data: allBalances } = useQuery({
    queryKey: ['fujin-all-balances', taprootAddress, network],
    enabled: !!taprootAddress,
    staleTime: 10_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!taprootAddress || !network) return new Map<string, bigint>();
      const { fetchUserAlkaneBalances } = await import('@/queries/account');
      return fetchUserAlkaneBalances(network, taprootAddress);
    },
  });

  const dieselBalance = allBalances?.get('2:0') || 0n;

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

  // LONG/SHORT token balances — single query, extract all from one protobuf response
  const longTokenId = activeMarket ? `${activeMarket.long.block}:${activeMarket.long.tx}` : null;
  const shortTokenId = activeMarket ? `${activeMarket.short.block}:${activeMarket.short.tx}` : null;

  // Debug: log token IDs and all balances to diagnose position display
  if (allBalances && allBalances.size > 0 && longTokenId) {
    console.log('[FujinPositions] All tokens:', Object.fromEntries([...allBalances.entries()].map(([k, v]) => [k, v.toString()])));
    console.log('[FujinPositions] LONG id:', longTokenId, 'SHORT id:', shortTokenId);
  }

  const userLongBalance = (longTokenId && allBalances?.get(longTokenId)) || 0n;
  const userShortBalance = (shortTokenId && allBalances?.get(shortTokenId)) || 0n;

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

  // Buy LONG/SHORT via zap contract — fuboku pattern: direct alkanesExecuteFull
  // with WASM provider's own mnemonic + symbolic addresses (p2tr:0, p2wpkh:0)
  // so UTXO discovery uses the WASM provider's internal derived addresses.
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

      // Create WASM provider with mnemonic loaded (fuboku pattern).
      // Pass actual addresses — this WASM version doesn't support symbolic p2tr:0.
      const wasm = await import('@alkanes/ts-sdk/wasm');
      const execProvider = new wasm.WebProvider('regtest', {
        jsonrpc_url: directRpcUrl,
        data_api_url: directRpcUrl,
      });
      const sessionMnemonic = sessionStorage.getItem('subfrost_session_mnemonic') || '';
      if (!sessionMnemonic) throw new Error('Wallet not unlocked');
      execProvider.walletLoadMnemonic(sessionMnemonic, null);

      const fromAddrs = [taprootAddress!];
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
          lock_alkanes: true,
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
  }, [quote, activeMarket, dieselSats, swapDirection, network, taprootAddress, directRpcUrl, queryClient]);

  // Close position state
  const [closingSide, setClosingSide] = useState<'LONG' | 'SHORT' | null>(null);
  const [closing, setClosing] = useState(false);

  const handleClose = useCallback(async (side: 'LONG' | 'SHORT') => {
    if (!activeMarket || !taprootAddress) return;
    const balance = side === 'LONG' ? userLongBalance : userShortBalance;
    if (balance <= 0n) return;
    setClosingSide(side);
    setClosing(true);
    try {
      const config = getConfig(network || 'regtest-local');
      const zapId = (config as any).FUJIN_ZAP_ID;
      if (!zapId) throw new Error('Zap contract not configured');
      const [zapBlock, zapTx] = zapId.split(':');
      const poolBlock = activeMarket.pool.block;
      const poolTx = activeMarket.pool.tx;
      const opcode = side === 'LONG' ? 6 : 7; // 6=close LONG, 7=close SHORT
      const tokenId = side === 'LONG' ? longTokenId : shortTokenId;
      if (!tokenId) throw new Error('Token ID not found');

      const protostone = `[${zapBlock},${zapTx},${opcode},${poolBlock},${poolTx},0,0]:v0:v0`;
      const inputRequirements = `${tokenId}:${balance}`;

      const wasm = await import('@alkanes/ts-sdk/wasm');
      const execProvider = new wasm.WebProvider('regtest', {
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
          lock_alkanes: true,
          mine_enabled: true,
          auto_confirm: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const txid = parsed?.txid || parsed?.reveal_txid || '';
      if (txid) window.alert(`Closed ${side} position! TX: ${txid.slice(0, 16)}...`);
      queryClient.invalidateQueries().catch(() => {});
    } catch (err: any) {
      console.error('[FujinClose] Error:', err);
      window.alert(`Close failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setClosing(false);
      setClosingSide(null);
    }
  }, [activeMarket, network, taprootAddress, segwitAddress, directRpcUrl, longTokenId, shortTokenId, userLongBalance, userShortBalance, queryClient]);

  // Percentage buttons
  const handlePct = (pct: number) => {
    if (dieselBalance > 0n) {
      const amt = (dieselBalance * BigInt(pct)) / 100n;
      setAmount((Number(amt) / 1e8).toString());
    }
  };

  // Position value estimates
  const longValueDiesel = longReserve > 0n && shortReserve > 0n && userLongBalance > 0n
    ? (userLongBalance * shortReserve) / (longReserve + userLongBalance) : 0n;
  const shortValueDiesel = longReserve > 0n && shortReserve > 0n && userShortBalance > 0n
    ? (userShortBalance * longReserve) / (shortReserve + userShortBalance) : 0n;
  const hasPositions = userLongBalance > 0n || userShortBalance > 0n;

  return (
    <div className="max-w-[480px] mx-auto space-y-3">
      {/* Market Info Card */}
      <div className="sf-card">
        <div className="sf-card-header">
          <span className="text-xs font-semibold uppercase tracking-wider">Difficulty Adjustment</span>
          {settlementInfo && (
            <span className="text-[11px] text-[color:var(--sf-text)]/40">
              Settles in {settlementInfo.timeLabel}
              {settlementInfo.settlementDate && ` · ${settlementInfo.settlementDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
          <div>
            <div className="text-[10px] text-[color:var(--sf-text)]/40 uppercase mb-0.5">Forecast</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
              {totalReserves > 0n ? `${impliedDiffChange >= 0 ? '+' : ''}${impliedDiffChange.toFixed(2)}%` : '--'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[color:var(--sf-text)]/40 uppercase mb-0.5">Difficulty</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
              {chainData?.difficulty ? formatDifficulty(chainData.difficulty) : '--'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[color:var(--sf-text)]/40 uppercase mb-0.5">Settlement</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
              {settlementInfo ? `${settlementInfo.progress}%` : '--'}
            </div>
            <div className="text-[10px] text-[color:var(--sf-text)]/30 tabular-nums">
              {settlementInfo ? `${settlementInfo.blocksElapsed.toLocaleString()} / ${settlementInfo.epochLen.toLocaleString()}` : ''}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[color:var(--sf-text)]/40 uppercase mb-0.5">Pool TVL</div>
            <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
              {fujinLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : poolTvlDiesel > 0n ? formatTokenAmount(poolTvlDiesel, 8) : '--'}
            </div>
            <div className="text-[10px] text-[color:var(--sf-text)]/30">DIESEL</div>
          </div>
        </div>
      </div>

      {/* Trade Card */}
      <div className="sf-card p-4 sm:p-5">
        {/* Direction toggle */}
        <div className="sf-tab-group mb-4">
          <button
            onClick={() => setSwapDirection('LONG')}
            className={swapDirection === 'LONG'
              ? 'sf-tab-btn flex-1 !bg-green-600 !text-white'
              : 'sf-tab-btn flex-1'}
          >
            <TrendingUp className="h-3 w-3 inline mr-1" />LONG
          </button>
          <button
            onClick={() => setSwapDirection('SHORT')}
            className={swapDirection === 'SHORT'
              ? 'sf-tab-btn flex-1 !bg-red-600 !text-white'
              : 'sf-tab-btn flex-1'}
          >
            <TrendingDown className="h-3 w-3 inline mr-1" />SHORT
          </button>
        </div>

        {/* Amount input */}
        <div className="sf-panel rounded-xl p-0 mb-3">
          <div className="flex items-center">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="flex-1 bg-transparent px-4 py-3.5 text-xl font-medium text-[color:var(--sf-text)] tabular-nums outline-none placeholder:text-[color:var(--sf-text)]/20 min-w-0"
            />
            <div className="flex items-center gap-1 shrink-0 pr-3">
              {[25, 50, 75].map(pct => (
                <button key={pct} onClick={() => handlePct(pct)} className="sf-percent-btn-pill hidden sm:block">{pct}%</button>
              ))}
              <button onClick={() => handlePct(100)} className="sf-percent-btn-pill">MAX</button>
            </div>
          </div>
        </div>
        <div className="flex justify-between px-1 mb-4">
          <span className="text-[11px] text-[color:var(--sf-text)]/30">Pay DIESEL</span>
          <span className="text-[11px] text-[color:var(--sf-text)]/30 tabular-nums">Balance: {formatTokenAmount(dieselBalance, 8)}</span>
        </div>

        {/* Quote details */}
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${amount ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="sf-panel rounded-xl p-3 mb-4 space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/40">Receive</span>
                <span className="tabular-nums font-semibold text-[color:var(--sf-text)]">
                  {quote ? `${formatTokenAmount(quote.expectedOutput, 8)} ${swapDirection}` : `-- ${swapDirection}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/40">Breakeven</span>
                <span className="tabular-nums text-[color:var(--sf-text)]/80">
                  {breakeven !== null ? `${breakeven >= 0 ? '+' : ''}${breakeven.toFixed(2)}%` : '--'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/40">Max Payout</span>
                <span className="tabular-nums text-green-400">
                  {quote ? `${formatTokenAmount(quote.expectedOutput, 8)} DIESEL (${multiplier.toFixed(2)}x)` : '--'}
                </span>
              </div>
              {quote && (
                <>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--sf-text)]/40">Fee</span>
                    <span className="tabular-nums text-[color:var(--sf-text)]/50">{formatTokenAmount(quote.feeAmount, 8)} DIESEL</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--sf-text)]/40">Price Impact</span>
                    <span className="tabular-nums text-[color:var(--sf-text)]/50">{quote.priceImpact.toFixed(2)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={handleBuy}
          disabled={!isConnected || !amount || !quote || buying}
          className="sf-btn-primary w-full py-3"
        >
          {buying ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
          {!isConnected ? 'Connect Wallet' : buying ? 'Buying...' : `Buy ${swapDirection}`}
        </button>
      </div>

      {/* Open Positions */}
      {isConnected && hasPositions && (
        <div className="sf-card">
          <div className="sf-card-header">
            <span className="text-xs font-semibold uppercase tracking-wider">Open Positions</span>
          </div>

          <div className="sf-table-header grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2">
            <span>Side</span>
            <span className="text-right">Value</span>
            <span className="w-[60px]" />
          </div>

          {userLongBalance > 0n && (
            <div className="sf-row grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2.5 items-center">
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">
                LONG
              </span>
              <div className="text-right">
                <span className="text-[11px] tabular-nums font-medium text-[color:var(--sf-text)]/80">
                  {longValueDiesel > 0n ? formatTokenAmount(longValueDiesel, 8) : formatTokenAmount(userLongBalance, 8)} DIESEL
                </span>
                <div className="text-[10px] tabular-nums text-[color:var(--sf-text)]/30">
                  {formatTokenAmount(userLongBalance, 8)} tokens
                </div>
              </div>
              <div className="w-[60px] flex justify-end">
                <button
                  onClick={() => handleClose('LONG')}
                  disabled={closing}
                  className="sf-btn-ghost text-[10px] font-semibold px-2 py-1 rounded-md text-red-400 hover:bg-red-500/10"
                >
                  {closing && closingSide === 'LONG' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Close'}
                </button>
              </div>
            </div>
          )}

          {userShortBalance > 0n && (
            <div className="sf-row grid grid-cols-[auto_1fr_auto] gap-3 px-3 py-2.5 items-center">
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">
                SHORT
              </span>
              <div className="text-right">
                <span className="text-[11px] tabular-nums font-medium text-[color:var(--sf-text)]/80">
                  {shortValueDiesel > 0n ? formatTokenAmount(shortValueDiesel, 8) : formatTokenAmount(userShortBalance, 8)} DIESEL
                </span>
                <div className="text-[10px] tabular-nums text-[color:var(--sf-text)]/30">
                  {formatTokenAmount(userShortBalance, 8)} tokens
                </div>
              </div>
              <div className="w-[60px] flex justify-end">
                <button
                  onClick={() => handleClose('SHORT')}
                  disabled={closing}
                  className="sf-btn-ghost text-[10px] font-semibold px-2 py-1 rounded-md text-red-400 hover:bg-red-500/10"
                >
                  {closing && closingSide === 'SHORT' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Close'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
