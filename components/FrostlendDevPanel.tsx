'use client';

/**
 * Frostlend devnet helper — slots into DevnetControlPanel when network === 'devnet'.
 *
 * Capabilities:
 *   - Deploy frostlend (one-shot — runs the 5-phase deploy from lib/frostlend/deploy.ts)
 *   - Set oracle price (absolute USD input + quick-drop buttons -10/-25/-50/-75%)
 *   - Liquidate trove by ID
 *   - Batch liquidate (worst-N)
 *   - Status: shows current oracle price + deployed flag
 *
 * The "deployed" detection is heuristic: we call PriceFeed.GetStoredPrice and treat
 * a non-zero response as evidence of a successful deploy. A failed simulate (no
 * contract at the slot) yields 0 and the panel offers the deploy button.
 */

import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Zap, AlertTriangle, RefreshCcw } from 'lucide-react';
import { deployFrostlend, setOraclePrice, liquidateTrove, liquidateTroves } from '@/lib/frostlend/deploy';
import {
  DEFAULT_INITIAL_PRICE_18DEC,
  FROSTLEND_CONTRACTS,
  PRICE_FEED_OPCODES,
  price18DecToUsd,
  usdPriceTo18Dec,
} from '@/constants/frostlend';
import { parseAlkaneTarget, parseU128, simulateAlkane } from '@/lib/frostlend/rpc';
import { readCachedTrove } from '@/lib/frostlend/troveCache';
import { useWallet } from '@/context/WalletContext';

type Busy =
  | null
  | 'deploy'
  | 'set-price'
  | 'liquidate'
  | 'batch-liquidate'
  | 'refresh';

const PRICE_DROP_PRESETS = [10, 25, 50, 75]; // percent

export default function FrostlendDevPanel({ network }: { network: string }) {
  const queryClient = useQueryClient();
  const { account } = useWallet();
  const myAddress = account?.taproot?.address || account?.nativeSegwit?.address || '';
  const myCachedTrove = network && myAddress ? readCachedTrove(network, myAddress) : null;
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<string>('');
  const [result, setResult] = useState<string | null>(null);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState<string>('50000');
  const [troveIdInput, setTroveIdInput] = useState<string>('0');
  const [batchN, setBatchN] = useState<string>('5');

  const refreshPrice = useCallback(async () => {
    try {
      const target = parseAlkaneTarget(FROSTLEND_CONTRACTS.PRICE_FEED);
      const exec = await simulateAlkane(network, target, [PRICE_FEED_OPCODES.GetStoredPrice.toString()]);
      const p = parseU128(exec);
      setPriceUsd(p === 0n ? null : price18DecToUsd(p));
    } catch {
      setPriceUsd(null);
    }
  }, [network]);

  useEffect(() => { refreshPrice(); }, [refreshPrice]);

  const isDeployed = priceUsd !== null && priceUsd > 0;

  const run = async (label: Busy, fn: () => Promise<string | void>) => {
    if (busy) return;
    setBusy(label);
    setResult(null);
    setProgress('');
    try {
      const msg = await fn();
      setResult(typeof msg === 'string' ? msg : 'Done');
      // tick the cache: lend page + balances should re-read
      queryClient.refetchQueries({ queryKey: ['frostlend'] }).catch(() => {});
      await refreshPrice();
      setTimeout(() => setResult(null), 3500);
    } catch (e: any) {
      setResult(`Error: ${e?.message?.slice(0, 80) || 'unknown'}`);
      setTimeout(() => setResult(null), 5000);
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  return (
    <div className="space-y-2 pt-2 border-t border-zinc-800">
      <div className="text-xs text-zinc-500 font-medium flex items-center justify-between">
        <span>Frostlend</span>
        <button
          onClick={() => run('refresh', async () => 'Refreshed')}
          className="text-zinc-500 hover:text-zinc-300"
          title="Refresh oracle price"
        >
          <RefreshCcw size={10} />
        </button>
      </div>

      <div className="text-[10px] text-zinc-400 font-mono">
        Status: {isDeployed ? <span className="text-green-400">deployed</span> : <span className="text-zinc-500">not deployed</span>}
        {priceUsd !== null && priceUsd > 0 && <> · ${priceUsd.toFixed(2)}/BTC</>}
      </div>

      {/* Deploy */}
      {!isDeployed && (
        <button
          disabled={busy !== null}
          onClick={() =>
            run('deploy', async () => {
              const r = await deployFrostlend((m, p) => setProgress(`${m} (${p}%)`), DEFAULT_INITIAL_PRICE_18DEC);
              if (!r.success) throw new Error(r.error || 'deploy failed');
              return `Deployed ${r.contractsDeployed}/11`;
            })
          }
          className="w-full px-2 py-1.5 bg-cyan-900/40 hover:bg-cyan-800/50 text-cyan-300 rounded-lg text-xs border border-cyan-800/40 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy === 'deploy' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          {busy === 'deploy' ? (progress || 'Deploying…') : 'Deploy frostlend'}
        </button>
      )}

      {/* Oracle price controls */}
      {isDeployed && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-zinc-500">Oracle price (USD/BTC)</div>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="decimal"
              className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 font-mono"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
            />
            <button
              disabled={busy !== null}
              onClick={() =>
                run('set-price', async () => {
                  const usd = Math.floor(Number(priceInput));
                  if (!usd || usd <= 0) throw new Error('invalid price');
                  await setOraclePrice(usdPriceTo18Dec(usd));
                  return `Price → $${usd}`;
                })
              }
              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs"
            >
              Set
            </button>
          </div>
          <div className="flex gap-1">
            {PRICE_DROP_PRESETS.map((pct) => (
              <button
                key={pct}
                disabled={busy !== null || priceUsd === null}
                onClick={() =>
                  run('set-price', async () => {
                    if (priceUsd === null) throw new Error('no price');
                    const next = Math.max(1, Math.floor(priceUsd * (1 - pct / 100)));
                    await setOraclePrice(usdPriceTo18Dec(next));
                    setPriceInput(next.toString());
                    return `Dropped ${pct}% → $${next}`;
                  })
                }
                className="flex-1 px-2 py-1 bg-amber-900/30 hover:bg-amber-800/40 text-amber-300 rounded text-[10px] border border-amber-800/40"
                title={`Drop oracle price ${pct}%`}
              >
                -{pct}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Liquidate */}
      {isDeployed && (
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] text-zinc-500 flex items-center gap-1">
            <AlertTriangle size={10} className="text-red-400" />
            Liquidate
          </div>
          {myCachedTrove && (
            <button
              disabled={busy !== null}
              onClick={() =>
                run('liquidate', async () => {
                  const id = BigInt(myCachedTrove.troveId);
                  await liquidateTrove(id);
                  return `Liquidated my trove #${id}`;
                })
              }
              className="w-full px-2 py-1 bg-red-900/40 hover:bg-red-800/50 text-red-200 rounded text-xs border border-red-700/50"
              title={`Liquidate the connected wallet's trove #${myCachedTrove.troveId}`}
            >
              Liquidate my trove (#{myCachedTrove.troveId})
            </button>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="numeric"
              className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 font-mono"
              value={troveIdInput}
              onChange={(e) => setTroveIdInput(e.target.value)}
              placeholder="trove ID"
            />
            <button
              disabled={busy !== null}
              onClick={() =>
                run('liquidate', async () => {
                  const id = BigInt(troveIdInput || '0');
                  await liquidateTrove(id);
                  return `Liquidated trove #${id}`;
                })
              }
              className="px-2 py-1 bg-red-900/30 hover:bg-red-800/40 text-red-300 rounded text-xs border border-red-800/40"
            >
              Liq
            </button>
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="numeric"
              className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-100 font-mono"
              value={batchN}
              onChange={(e) => setBatchN(e.target.value)}
              placeholder="max count"
            />
            <button
              disabled={busy !== null}
              onClick={() =>
                run('batch-liquidate', async () => {
                  const n = Number(batchN || '0');
                  if (!n || n <= 0) throw new Error('invalid count');
                  await liquidateTroves(n);
                  return `Batch-liquidated up to ${n}`;
                })
              }
              className="px-2 py-1 bg-red-900/30 hover:bg-red-800/40 text-red-300 rounded text-xs border border-red-800/40"
            >
              Batch
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`text-[10px] px-2 py-1 rounded font-mono ${
          result.startsWith('Error') ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}
