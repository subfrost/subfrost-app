'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDevnet } from '@/context/DevnetContext';
import { useWallet } from '@/context/WalletContext';
import { Loader2, RotateCcw } from 'lucide-react';

type BusyAction = 'mine' | 'btc' | 'diesel' | 'fuel' | 'frbtc' | 'reset' | null;

export function DevnetControlPanel() {
  const { state, controls, isDevnet, boot, shutdown } = useDevnet();
  const { account } = useWallet();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const address = account?.taproot?.address || '';
  const segwitAddress = account?.nativeSegwit?.address || '';

  // Run an async action with loading state + query invalidation
  const runAction = useCallback(async (action: BusyAction, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    setLastResult(null);
    try {
      await fn();
      // Invalidate React Query caches so balances refresh
      await new Promise(r => setTimeout(r, 200));
      queryClient.invalidateQueries().catch(() => {});
      setLastResult('Done');
      setTimeout(() => setLastResult(null), 2000);
    } catch (e: any) {
      setLastResult(`Error: ${e?.message?.slice(0, 60) || 'Unknown'}`);
      setTimeout(() => setLastResult(null), 5000);
    } finally {
      setBusy(null);
    }
  }, [busy, queryClient]);

  if (!isDevnet || state.status !== 'ready') return null;

  const ActionButton = ({ action, onClick, className, children }: {
    action: BusyAction;
    onClick: () => void;
    className: string;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      disabled={busy !== null}
      className={`${className} ${busy !== null ? 'opacity-40 cursor-not-allowed' : ''} relative`}
    >
      {busy === action ? (
        <Loader2 className="h-3 w-3 animate-spin mx-auto" />
      ) : children}
    </button>
  );

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-4">
      {/* Collapsed badge */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-2 rounded-xl text-xs font-mono shadow-lg flex items-center gap-2"
        >
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          Devnet H:{state.chainHeight}
        </button>
      )}

      {/* Expanded panel */}
      {isExpanded && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 w-72 shadow-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-white flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Devnet Controls
            </div>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-zinc-500 hover:text-white text-sm"
            >
              ✕
            </button>
          </div>

          {/* Chain info */}
          <div className="text-xs text-zinc-400 font-mono space-y-1">
            <div>Height: {state.chainHeight}</div>
            {address && (
              <div className="truncate text-[10px] text-zinc-600">
                {address.slice(0, 12)}...{address.slice(-6)}
              </div>
            )}
          </div>

          {/* Status toast */}
          {lastResult && (
            <div className={`text-[10px] px-2 py-1 rounded-lg font-mono ${
              lastResult.startsWith('Error') ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'
            }`}>
              {lastResult}
            </div>
          )}

          {/* Mining */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-500 font-medium">Mine Blocks</div>
            <div className="flex gap-2">
              {[1, 10, 100].map(n => (
                <ActionButton
                  key={n}
                  action="mine"
                  onClick={() => runAction('mine', () => controls.mineBlocks(n))}
                  className="flex-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
                >
                  +{n}
                </ActionButton>
              ))}
            </div>
          </div>

          {/* Faucet */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-500 font-medium">
              Faucet {!address && <span className="text-amber-500">(connect wallet first)</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton
                action="btc"
                onClick={() => runAction('btc', () => controls.faucetBtc(address || segwitAddress, 100_000_000))}
                className="px-2 py-1.5 bg-orange-900/50 hover:bg-orange-800/50 text-orange-300 rounded-lg text-xs border border-orange-800/30"
              >
                +1 BTC
              </ActionButton>
              <ActionButton
                action="diesel"
                onClick={() => runAction('diesel', () => controls.faucetDiesel(address || segwitAddress))}
                className="px-2 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 rounded-lg text-xs border border-blue-800/30"
              >
                +DIESEL
              </ActionButton>
              <ActionButton
                action="fuel"
                onClick={() => runAction('fuel', () => controls.faucetFuel(address || segwitAddress))}
                className="px-2 py-1.5 bg-purple-900/50 hover:bg-purple-800/50 text-purple-300 rounded-lg text-xs border border-purple-800/30"
              >
                +FUEL
              </ActionButton>
              <ActionButton
                action="frbtc"
                onClick={() => runAction('frbtc', () => controls.faucetBtc(address || segwitAddress, 100_000_000))}
                className="px-2 py-1.5 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded-lg text-xs border border-green-800/30"
              >
                Wrap frBTC
              </ActionButton>
            </div>
          </div>

          {/* Reset */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
            <div className="text-[10px] text-zinc-600 font-mono">
              In-browser Bitcoin node
            </div>
            <ActionButton
              action="reset"
              onClick={() => runAction('reset', () => controls.resetDevnet())}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-red-400 rounded transition-colors"
            >
              <RotateCcw size={10} />
              Reset
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}

export function DevnetNetworkBanner() {
  const { isDevnet, state } = useDevnet();

  if (!isDevnet || state.status !== 'ready') return null;

  return (
    <div className="bg-cyan-900/30 border-b border-cyan-800/30 px-4 py-1.5 text-center">
      <span className="text-xs text-cyan-300 font-mono">
        Running on In-Browser Devnet — all transactions are simulated locally
      </span>
    </div>
  );
}
