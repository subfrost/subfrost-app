'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { Pickaxe, Clock, Zap } from 'lucide-react';

export default function RegtestControls() {
  const { network, account, refreshBalances } = useWallet() as any;
  const queryClient = useQueryClient();
  const [mining, setMining] = useState(false);
  const [message, setMessage] = useState('');

  // Only show for regtest networks (local regtest, subfrost-regtest, oylnet)
  if (network !== 'regtest' && network !== 'subfrost-regtest' && network !== 'oylnet') {
    return null;
  }

  const showMessage = (msg: string, duration = 3000) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  };

  const mineBlocks = async (count: number) => {
    setMining(true);
    try {
      // Get taproot address (p2tr:0)
      const address = account?.taproot?.address;
      if (!address) {
        throw new Error('No taproot address available. Please connect wallet first.');
      }
      
      // Dynamic import WASM to avoid SSR issues
      const wasm = await import('@alkanes/ts-sdk/wasm');

      // Create WebProvider with network preset and subfrost URL overrides
      const providerName = network === 'subfrost-regtest' ? 'subfrost-regtest' : 'regtest';
      const configOverrides = {
        jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
        data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
      };
      const provider = new wasm.WebProvider(providerName, configOverrides);

      // Call bitcoindGenerateToAddress (uses alkanes-cli-common code path)
      const result = await provider.bitcoindGenerateToAddress(count, address);
      
      console.log('[RegtestControls] Mined blocks:', result);
      showMessage(`✅ Mined ${count} block(s) successfully!`);

      // Invalidate all queries to refresh data
      await queryClient.invalidateQueries();
      // Also refresh wallet balances if available
      if (refreshBalances) {
        await refreshBalances();
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
      // Dynamic import WASM to avoid SSR issues
      const wasm = await import('@alkanes/ts-sdk/wasm');

      // Create WebProvider with network preset and subfrost URL overrides
      const providerName = network === 'subfrost-regtest' ? 'subfrost-regtest' : 'regtest';
      const configOverrides = {
        jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost',
        data_api_url: 'https://regtest.subfrost.io/v4/subfrost',
      };
      const provider = new wasm.WebProvider(providerName, configOverrides);

      // Call bitcoindGenerateFuture (automatically computes Subfrost address from frBTC signer)
      // The address parameter is ignored - it will call frBTC [32:0] GET_SIGNER to get the address
      const result = await provider.bitcoindGenerateFuture('');
      
      console.log('[RegtestControls] Generated future:', result);
      showMessage(`✅ Generated future block with Subfrost address!`);

      // Invalidate all queries to refresh data
      await queryClient.invalidateQueries();
      // Also refresh wallet balances if available
      if (refreshBalances) {
        await refreshBalances();
      }
    } catch (error) {
      console.error('Generate future error:', error);
      showMessage(`❌ Failed to generate future: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const networkLabel = network === 'subfrost-regtest' ? 'Subfrost Regtest' :
                       network === 'regtest' ? 'Local Regtest' : 'Oylnet';

  return (
    <div className="mt-8 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Pickaxe size={24} className="text-orange-400" />
        <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Regtest Controls</h3>
        <span className="text-sm text-[color:var(--sf-text)]/60">({networkLabel})</span>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mine 200 Blocks */}
        <button
          onClick={() => mineBlocks(200)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-orange-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Pickaxe size={32} className="text-orange-400" />
          <span className="font-semibold">Mine 200 Blocks</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">Generate bulk blocks</span>
        </button>

        {/* Mine 1 Block */}
        <button
          onClick={() => mineBlocks(1)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-[color:var(--sf-primary)]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Zap size={32} className="text-[color:var(--sf-primary)]" />
          <span className="font-semibold">Mine 1 Block</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">Generate single block</span>
        </button>

        {/* Generate Future */}
        <button
          onClick={generateFuture}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Clock size={32} className="text-purple-500 dark:text-purple-400" />
          <span className="font-semibold">Generate Future</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">Create future block</span>
        </button>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)]">
        <p className="text-sm text-[color:var(--sf-text)]/60">
          <strong className="text-[color:var(--sf-text)]/80">Note:</strong> These controls interact with the Bitcoin regtest node.
          Mining blocks will confirm transactions and generate test BTC to your taproot address.
        </p>
      </div>
    </div>
  );
}
