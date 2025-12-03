'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { Pickaxe, Clock, Zap } from 'lucide-react';

export default function RegtestControls() {
  const { network, account } = useWallet();
  const [mining, setMining] = useState(false);
  const [message, setMessage] = useState('');

  // Only show for regtest networks
  if (network !== 'regtest') {
    return null;
  }

  const showMessage = (msg: string, duration = 3000) => {
    setMessage(msg);
    if (duration > 0) {
      setTimeout(() => setMessage(''), duration);
    }
  };

  // Poll esplora until it reaches the expected block height
  const waitForEsploraSync = async (expectedHeight: number, maxWaitMs = 60000): Promise<boolean> => {
    const startTime = Date.now();
    const pollInterval = 500; // Check every 500ms

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await fetch('/api/esplora/blocks/tip/height');
        if (response.ok) {
          const text = await response.text();
          const currentHeight = parseInt(text, 10);
          console.log(`[RegtestControls] Esplora height: ${currentHeight}, expected: ${expectedHeight}`);

          if (currentHeight >= expectedHeight) {
            return true;
          }
        }
      } catch (e) {
        console.warn('[RegtestControls] Error checking esplora height:', e);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`[RegtestControls] Esplora sync timeout after ${maxWaitMs}ms`);
    return false;
  };

  const mineBlocks = async (count: number) => {
    setMining(true);
    try {
      // Get taproot address from account (already available from useWallet at top level)
      const address = account?.taproot?.address;
      if (!address) {
        throw new Error('No taproot address available. Please connect wallet first.');
      }

      // Use the API route to mine blocks via Docker
      const response = await fetch('/api/regtest/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, blocks: count }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to mine blocks');
      }

      console.log('[RegtestControls] Mined blocks:', result);
      showMessage(`✅ Mined ${count} block(s)! Waiting for indexer to sync...`, 0);

      // Wait for esplora to sync to the new block height
      const synced = await waitForEsploraSync(result.newBlockHeight);

      if (synced) {
        showMessage(`✅ Indexer synced! Refreshing...`);
        setTimeout(() => window.location.reload(), 500);
      } else {
        showMessage(`⚠️ Indexer still syncing. Refreshing anyway...`);
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (error) {
      console.error('Mining error:', error);
      showMessage(`❌ Failed to mine blocks: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const generateFuture = async () => {
    setMining(true);
    try {
      // Dynamic import WASM from public directory
      // @ts-expect-error - Dynamic import from public folder at runtime
      const wasm = await import(/* webpackIgnore: true */ '/wasm/alkanes_web_sys.js');
      await wasm.default();

      const { getNetworkUrls } = await import('@/utils/alkanesProvider');

      // Create WebProvider
      const networkUrls = getNetworkUrls(network);
      const provider = new wasm.WebProvider(network);

      // Call bitcoindGenerateFuture (automatically computes Subfrost address from frBTC signer)
      // The address parameter is ignored - it will call frBTC [32:0] GET_SIGNER to get the address
      const result = await provider.bitcoindGenerateFuture('');

      console.log('[RegtestControls] Generated future:', result);
      showMessage(`✅ Generated future block with Subfrost address!`);

      // Trigger a refetch
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error('Generate future error:', error);
      showMessage(`❌ Failed to generate future: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const networkLabel = network === 'regtest' ? 'Subfrost Regtest' : 'Local Regtest';

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Pickaxe size={24} className="text-orange-400" />
        <h3 className="text-xl font-bold">Regtest Controls</h3>
        <span className="text-sm text-white/60">({networkLabel})</span>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mine 200 Blocks */}
        <button
          onClick={() => mineBlocks(200)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Pickaxe size={32} className="text-orange-400" />
          <span className="font-semibold">Mine 200 Blocks</span>
          <span className="text-sm text-white/60">Generate bulk blocks</span>
        </button>

        {/* Mine 1 Block */}
        <button
          onClick={() => mineBlocks(1)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Zap size={32} className="text-blue-400" />
          <span className="font-semibold">Mine 1 Block</span>
          <span className="text-sm text-white/60">Generate single block</span>
        </button>

        {/* Generate Future */}
        <button
          onClick={generateFuture}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Clock size={32} className="text-purple-400" />
          <span className="font-semibold">Generate Future</span>
          <span className="text-sm text-white/60">Create future block</span>
        </button>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
        <p className="text-sm text-white/60">
          <strong className="text-white/80">Note:</strong> These controls interact with the Bitcoin regtest node.
          Mining blocks will confirm transactions and generate test BTC to your taproot address.
        </p>
      </div>
    </div>
  );
}
