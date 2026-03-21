'use client';

import { useDevnet } from '@/context/DevnetContext';

export function DevnetBootModal() {
  const { state } = useDevnet();

  if (state.status !== 'booting') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center space-y-6">
          <div className="text-2xl font-bold text-white">Setting Up Devnet</div>
          <p className="text-zinc-400 text-sm">
            Initializing in-browser Bitcoin node with full protocol stack...
          </p>

          {/* Progress bar */}
          <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${state.bootPercent}%` }}
            />
          </div>

          <p className="text-sm text-zinc-300 font-mono">
            {state.bootProgress}
          </p>

          <p className="text-xs text-zinc-500">
            {state.bootPercent}% — Loading ~15MB of WASM modules
          </p>
        </div>
      </div>
    </div>
  );
}

export function DevnetErrorModal() {
  const { state, shutdown } = useDevnet();

  if (state.status !== 'error') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-red-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center space-y-4">
          <div className="text-xl font-bold text-red-400">Devnet Error</div>
          <p className="text-zinc-300 text-sm">{state.error}</p>
          <button
            onClick={shutdown}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function DevnetWalletNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-amber-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <div className="text-center space-y-4">
          <div className="text-xl font-bold text-amber-400">Browser Wallet Not Supported</div>
          <p className="text-zinc-300 text-sm">
            Browser extension wallets cannot sign transactions on the in-browser devnet.
          </p>
          <p className="text-zinc-400 text-sm">
            Please use <strong>Connect Wallet → Keystore</strong> to load or create a wallet
            that signs locally.
          </p>
          <button
            onClick={onDismiss}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
