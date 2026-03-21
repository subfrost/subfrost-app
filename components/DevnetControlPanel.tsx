'use client';

import { useState } from 'react';
import { useDevnet } from '@/context/DevnetContext';
import { useWallet } from '@/context/WalletContext';

export function DevnetControlPanel() {
  const { state, controls, isDevnet } = useDevnet();
  const { account } = useWallet();
  const [isExpanded, setIsExpanded] = useState(false);
  const [miningCount, setMiningCount] = useState(1);

  if (!isDevnet || state.status !== 'ready') return null;

  const address = account?.taproot?.address || '';

  return (
    <div className="fixed bottom-20 right-4 z-50 md:bottom-4">
      {/* Collapsed: small badge */}
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
            <div>Contracts: {state.contracts ? Object.keys(state.contracts).length : 0}</div>
          </div>

          {/* Mining */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-500 font-medium">Mine Blocks</div>
            <div className="flex gap-2">
              <button
                onClick={() => { controls.mineBlocks(1); }}
                className="flex-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
              >
                +1
              </button>
              <button
                onClick={() => { controls.mineBlocks(10); }}
                className="flex-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
              >
                +10
              </button>
              <button
                onClick={() => { controls.mineBlocks(100); }}
                className="flex-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs"
              >
                +100
              </button>
            </div>
          </div>

          {/* Faucet */}
          <div className="space-y-1">
            <div className="text-xs text-zinc-500 font-medium">Faucet</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => controls.faucetBtc(address, 100000000)}
                className="px-2 py-1.5 bg-orange-900/50 hover:bg-orange-800/50 text-orange-300 rounded-lg text-xs border border-orange-800/30"
              >
                +1 BTC
              </button>
              <button
                onClick={() => controls.faucetDiesel(address)}
                className="px-2 py-1.5 bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 rounded-lg text-xs border border-blue-800/30"
              >
                +5K DIESEL
              </button>
              <button
                onClick={() => controls.faucetFuel(address)}
                className="px-2 py-1.5 bg-purple-900/50 hover:bg-purple-800/50 text-purple-300 rounded-lg text-xs border border-purple-800/30"
              >
                +100 FUEL
              </button>
              <button
                onClick={() => controls.mineBlocks(1)}
                className="px-2 py-1.5 bg-green-900/50 hover:bg-green-800/50 text-green-300 rounded-lg text-xs border border-green-800/30"
              >
                Wrap frBTC
              </button>
            </div>
          </div>

          {/* Status */}
          <div className="pt-2 border-t border-zinc-800">
            <div className="text-[10px] text-zinc-600 font-mono">
              In-browser Bitcoin node • All data is local
            </div>
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
