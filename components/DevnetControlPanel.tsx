'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDevnet } from '@/context/DevnetContext';
import { useWallet } from '@/context/WalletContext';
import { getBootAddresses } from '@/lib/devnet/boot';
import { Loader2, RotateCcw, Play, Pause, Square, Activity } from 'lucide-react';
import type { SimLogEntry } from '@/lib/devnet/types';

type BusyAction = 'mine' | 'btc' | 'diesel' | 'fuel' | 'frbtc' | 'usdt' | 'usdc' | 'bridge' | 'reset' | null;

// ── Action label + color map for the log ─────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  swap_diesel_to_frbtc: 'text-blue-400',
  swap_frbtc_to_diesel: 'text-cyan-400',
  add_liquidity:        'text-green-400',
  remove_liquidity:     'text-yellow-400',
  vault_deposit:        'text-emerald-400',
  vault_withdraw:       'text-amber-400',
  wrap_btc:             'text-orange-400',
  unwrap_frbtc:         'text-orange-300',
  fire_stake:           'text-red-400',
  fire_unstake:         'text-red-300',
  fire_claim:           'text-pink-400',
  gauge_stake:          'text-purple-400',
  gauge_unstake:        'text-purple-300',
  idle:                 'text-zinc-500',
};

const ACTION_SHORT: Record<string, string> = {
  swap_diesel_to_frbtc: 'SWAP D→fB',
  swap_frbtc_to_diesel: 'SWAP fB→D',
  add_liquidity:        'ADD LP',
  remove_liquidity:     'RM LP',
  vault_deposit:        'VAULT+',
  vault_withdraw:       'VAULT-',
  wrap_btc:             'WRAP',
  unwrap_frbtc:         'UNWRAP',
  fire_stake:           'FIRE+',
  fire_unstake:         'FIRE-',
  fire_claim:           'CLAIM',
  gauge_stake:          'GAUGE+',
  gauge_unstake:        'GAUGE-',
  idle:                 'IDLE',
};

// ── Speed presets ────────────────────────────────────────────────────────

const SPEED_PRESETS = [
  { label: '0.5x', ms: 8000 },
  { label: '1x',   ms: 4000 },
  { label: '2x',   ms: 2000 },
  { label: '3x',   ms: 1500 },
];

export function DevnetControlPanel() {
  const { state, controls, isDevnet, boot, shutdown, coordinator, simulator, simulationState } = useDevnet();
  const { account } = useWallet();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSimPanel, setShowSimPanel] = useState(false);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  // Use the CONNECTED wallet address for token outputs (where minted assets land).
  // The SDK provider is loaded with the boot mnemonic for FUNDING (UTXOs to pay fees),
  // but tokens must go to the address the UI queries for balances.
  // Previously this used getBootAddresses() which derives different addresses than
  // createWalletFromMnemonic() in WalletContext, causing a mismatch where tokens
  // were minted to an address the balance query never checked.
  const address = account?.taproot?.address || '';
  const segwitAddress = account?.nativeSegwit?.address || '';

  // Run an async action with loading state + query invalidation
  const runAction = useCallback(async (action: BusyAction, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(action);
    setLastResult(null);
    try {
      await fn();
      // ⚠️ (2026-03-26): MUST use refetchQueries(), not invalidateQueries().
      // invalidateQueries only marks queries as stale — it won't re-execute
      // the queryFn if the data is within staleTime. On devnet, alkane balance
      // queries have 2s staleTime, but even that can prevent immediate updates.
      // refetchQueries() forces the queryFn to run regardless of staleTime.
      await new Promise(r => setTimeout(r, 300));
      queryClient.refetchQueries().catch(() => {});
      setLastResult('Done');
      setTimeout(() => setLastResult(null), 2000);
    } catch (e: any) {
      setLastResult(`Error: ${e?.message?.slice(0, 60) || 'Unknown'}`);
      setTimeout(() => setLastResult(null), 5000);
    } finally {
      setBusy(null);
    }
  }, [busy, queryClient]);

  // Simulation status derived from reactive state
  const simStatus = simulationState?.status ?? 'idle';
  const simRunning = simStatus === 'running';
  const simPaused = simStatus === 'paused';

  // Action distribution for the mini chart
  const actionDistribution = useMemo(() => {
    if (!simulationState?.log?.length) return [];
    const counts: Record<string, number> = {};
    const recent = simulationState.log.slice(0, 100);
    for (const entry of recent) {
      if (entry.action !== 'idle') {
        counts[entry.action] = (counts[entry.action] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [simulationState?.log]);

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
          <span className={`w-2 h-2 rounded-full ${simRunning ? 'bg-yellow-400 animate-pulse' : 'bg-green-400 animate-pulse'}`} />
          Devnet H:{state.chainHeight}
          {simRunning && <span className="text-yellow-200">SIM</span>}
        </button>
      )}

      {/* Expanded panel */}
      {isExpanded && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 w-80 shadow-2xl space-y-3 max-h-[85vh] overflow-y-auto">
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
            <div className="grid grid-cols-3 gap-2">
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
                onClick={() => runAction('frbtc', () => controls.faucetFrbtc(address || segwitAddress))}
                className="px-2 py-1.5 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded-lg text-xs border border-green-800/30"
              >
                +frBTC
              </ActionButton>
              <ActionButton
                action="usdt"
                onClick={() => runAction('usdt', () => controls.faucetUsdt(address || segwitAddress))}
                className="px-2 py-1.5 bg-emerald-900/50 hover:bg-emerald-800/50 text-emerald-300 rounded-lg text-xs border border-emerald-800/30"
              >
                +USDT
              </ActionButton>
              <ActionButton
                action="usdc"
                onClick={() => runAction('usdc', () => controls.faucetUsdc(address || segwitAddress))}
                className="px-2 py-1.5 bg-sky-900/50 hover:bg-sky-800/50 text-sky-300 rounded-lg text-xs border border-sky-800/30"
              >
                +USDC
              </ActionButton>
            </div>
          </div>

          {/* ── Market Simulation ─────────────────────────────────────── */}
          {simulator && (
            <div className="space-y-2 pt-1 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="text-xs text-zinc-500 font-medium flex items-center gap-1.5">
                  <Activity size={12} />
                  Market Simulation
                </div>
                <button
                  onClick={() => setShowSimPanel(!showSimPanel)}
                  className="text-[10px] text-zinc-600 hover:text-zinc-400"
                >
                  {showSimPanel ? 'hide' : 'show'}
                </button>
              </div>

              {/* Quick controls row */}
              <div className="flex items-center gap-2">
                {simStatus === 'idle' && (
                  <button
                    onClick={() => simulator.start()}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded-lg text-xs border border-green-800/30"
                  >
                    <Play size={10} /> Start
                  </button>
                )}
                {simRunning && (
                  <>
                    <button
                      onClick={() => simulator.pause()}
                      className="flex items-center gap-1 px-3 py-1.5 bg-yellow-900/50 hover:bg-yellow-800/50 text-yellow-300 rounded-lg text-xs border border-yellow-800/30"
                    >
                      <Pause size={10} /> Pause
                    </button>
                    <button
                      onClick={() => simulator.stop()}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded-lg text-xs border border-red-800/30"
                    >
                      <Square size={10} /> Stop
                    </button>
                  </>
                )}
                {simPaused && (
                  <>
                    <button
                      onClick={() => simulator.resume()}
                      className="flex items-center gap-1 px-3 py-1.5 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded-lg text-xs border border-green-800/30"
                    >
                      <Play size={10} /> Resume
                    </button>
                    <button
                      onClick={() => simulator.stop()}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded-lg text-xs border border-red-800/30"
                    >
                      <Square size={10} /> Stop
                    </button>
                  </>
                )}

                {/* Stats badge */}
                {simulationState && simulationState.round > 0 && (
                  <div className="ml-auto text-[10px] text-zinc-500 font-mono">
                    R{simulationState.round} | {simulationState.totalActions}ok {simulationState.totalErrors}err
                  </div>
                )}
              </div>

              {/* Expanded sim panel */}
              {showSimPanel && simulationState && (
                <div className="space-y-2">
                  {/* Speed control */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600 w-10">Speed:</span>
                    {SPEED_PRESETS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => simulator.setSpeed(p.ms)}
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          simulationState.intervalMs === p.ms
                            ? 'bg-cyan-800 text-cyan-200'
                            : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Agents per round */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-zinc-600 w-10">Batch:</span>
                    {[1, 2, 3, 5, 10].map(n => (
                      <button
                        key={n}
                        onClick={() => simulator.setAgentsPerRound(n)}
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          simulationState.agentsPerRound === n
                            ? 'bg-cyan-800 text-cyan-200'
                            : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>

                  {/* Action distribution mini-bar */}
                  {actionDistribution.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="text-[10px] text-zinc-600">Action distribution (last 100):</div>
                      {actionDistribution.map(([action, count]) => (
                        <div key={action} className="flex items-center gap-1">
                          <span className={`text-[9px] font-mono w-16 truncate ${ACTION_COLORS[action] || 'text-zinc-500'}`}>
                            {ACTION_SHORT[action] || action}
                          </span>
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                action.startsWith('swap') ? 'bg-blue-500' :
                                action.includes('liquidity') ? 'bg-green-500' :
                                action.includes('vault') ? 'bg-emerald-500' :
                                action.includes('fire') ? 'bg-red-500' :
                                action.includes('gauge') ? 'bg-purple-500' :
                                'bg-orange-500'
                              }`}
                              style={{ width: `${Math.min(100, (count / (actionDistribution[0]?.[1] || 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-zinc-600 w-4 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Rolling activity log */}
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-zinc-600">Activity log:</div>
                    <div className="max-h-36 overflow-y-auto space-y-px font-mono">
                      {(simulationState.log || []).slice(0, 30).map((entry: SimLogEntry, i: number) => (
                        <div
                          key={`${entry.round}-${entry.agentId}-${i}`}
                          className={`text-[9px] flex items-start gap-1 ${entry.success ? '' : 'opacity-50'}`}
                        >
                          <span className="text-zinc-700 w-6 shrink-0">R{entry.round}</span>
                          <span className={`w-14 shrink-0 truncate ${ACTION_COLORS[entry.action] || 'text-zinc-500'}`}>
                            {ACTION_SHORT[entry.action] || entry.action}
                          </span>
                          <span className="text-zinc-600 truncate">{entry.detail}</span>
                        </div>
                      ))}
                      {(!simulationState.log || simulationState.log.length === 0) && (
                        <div className="text-[9px] text-zinc-700 italic">No activity yet — start the simulation</div>
                      )}
                    </div>
                  </div>

                  {/* Agent summary */}
                  <div className="text-[10px] text-zinc-600 flex gap-3">
                    <span>60 agents</span>
                    <span>
                      {simulationState.agents.filter(a => a.hasLp).length} w/ LP
                    </span>
                    <span>
                      {simulationState.agents.filter(a => a.hasFireStake).length} staked
                    </span>
                    <span>
                      {simulationState.agents.filter(a => a.hasVaultDeposit).length} in vault
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bridge Coordinator */}
          {coordinator && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-500 font-medium">Bridge Coordinator</div>
              <ActionButton
                action="bridge"
                onClick={() => runAction('bridge', async () => {
                  const result = await coordinator.poll();
                  const counts = coordinator.getPendingCounts();
                  if (result.depositsProcessed > 0 || result.withdrawalsProcessed > 0) {
                    setLastResult(`Processed ${result.depositsProcessed} dep, ${result.withdrawalsProcessed} wd`);
                  } else if (counts.deposits > 0 || counts.withdrawals > 0) {
                    setLastResult(`${counts.deposits} pending deposits, ${counts.withdrawals} pending withdrawals`);
                  } else {
                    setLastResult('No pending bridge operations');
                  }
                })}
                className="w-full px-2 py-1.5 bg-indigo-900/50 hover:bg-indigo-800/50 text-indigo-300 rounded-lg text-xs border border-indigo-800/30"
              >
                Process Bridge
              </ActionButton>
            </div>
          )}

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
