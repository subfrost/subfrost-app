'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { Pickaxe, Clock, Zap, Fuel, Snowflake } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export default function RegtestControls() {
  const { network, account } = useWallet();
  const { provider, isWalletLoaded } = useAlkanesSDK();
  const extendedProvider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [mining, setMining] = useState(false);
  const [message, setMessage] = useState('');

  // Only show for regtest/devnet networks
  // JOURNAL (2026-03-31): Added 'devnet' to the allowlist — devnet is an in-process
  // qubitcoin node accessible via the fetch interceptor at localhost:18888. It was
  // missing from this guard so the controls never rendered when devnet was selected.
  const REGTEST_NETWORKS = ['regtest', 'subfrost-regtest', 'oylnet', 'regtest-local', 'qubitcoin-regtest', 'devnet'] as const;
  if (!REGTEST_NETWORKS.includes(network as typeof REGTEST_NETWORKS[number])) {
    return null;
  }

  const showMessage = (msg: string, duration = 3000) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), duration);
  };

  const mineBlocks = async (count: number) => {
    setMining(true);
    try {
      // Get Taproot address (p2tr) for mining rewards
      // Use taproot so the funds are immediately available for DIESEL minting
      const address = account?.taproot?.address || account?.nativeSegwit?.address;
      if (!address) {
        throw new Error('No address available. Please connect wallet first.');
      }

      // JOURNAL ENTRY (2026-02-19):
      // Backend only mines 1 block per API call, regardless of requested count.
      // Loop until we've mined the requested number of blocks.
      let totalMined = 0;
      while (totalMined < count) {
        const remaining = count - totalMined;
        showMessage(`⛏️ Mining block ${totalMined + 1}/${count}...`, 60000);

        // Use the API route which bypasses WASM issues
        const response = await fetch('/api/regtest/mine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks: remaining, address, network }),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
          throw new Error(result.error || 'Failed to mine blocks');
        }

        // Backend returns count of how many blocks were actually mined
        const minedCount = result.count || result.blocks?.length || 1;
        totalMined += minedCount;

        console.log(`[RegtestControls] Mined ${minedCount} blocks (${totalMined}/${count} total):`, result);

        // Small delay between mining calls to allow indexer to process
        if (totalMined < count) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      showMessage(`✅ Mined ${totalMined} block(s) successfully! Refreshing...`);

      // Wait briefly for indexer to finish processing all blocks
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Invalidate queries but don't wait for refetch to complete (fire and forget)
      // This prevents hanging if some queries take too long
      queryClient.invalidateQueries().catch((err) => {
        console.warn('[RegtestControls] Query invalidation error (non-fatal):', err);
      });

      showMessage(`✅ Mined ${totalMined} block(s)!`);
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

      // Create WebProvider with network preset and appropriate URL overrides.
      // JOURNAL (2026-03-31): devnet uses localhost:18888 (in-process qubitcoin).
      // The browser fetch interceptor routes calls to the in-process node for devnet.
      const providerName = network === 'subfrost-regtest' ? 'subfrost-regtest' : 'regtest';
      const isLocalNetwork = network === 'regtest-local' || network === 'devnet';
      const configOverrides = isLocalNetwork
        ? { jsonrpc_url: 'http://localhost:18888', data_api_url: 'http://localhost:18888' }
        : { jsonrpc_url: 'https://regtest.subfrost.io/v4/subfrost', data_api_url: 'https://regtest.subfrost.io/v4/subfrost' };
      const provider = new wasm.WebProvider(providerName, configOverrides);

      // Call bitcoindGenerateFuture (automatically computes Subfrost address from frBTC signer)
      // The address parameter is ignored - it will call frBTC [32:0] GET_SIGNER to get the address
      const result = await provider.bitcoindGenerateFuture('');
      
      console.log('[RegtestControls] Generated future:', result);
      showMessage(`✅ Generated future block with Subfrost address!`);

      // Invalidate queries (fire and forget to prevent hanging)
      queryClient.invalidateQueries().catch((err) => {
        console.warn('[RegtestControls] Query invalidation error (non-fatal):', err);
      });
    } catch (error) {
      console.error('Generate future error:', error);
      showMessage(`❌ Failed to generate future: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const mineDiesel = async () => {
    setMining(true);
    try {
      if (!extendedProvider) throw new Error('Provider not initialized');

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      // execute.ts routes regtest-local through alkanesExecuteFull
      // which handles signing, broadcasting, and mining automatically
      // qubitcoin requires higher min relay fee than standard regtest
      const isQubitcoin = network === 'qubitcoin-regtest';
      const result = await extendedProvider.alkanesExecuteTyped({
        inputRequirements: '',
        protostones: '[2,0,77]:v0:v0',
        feeRate: isQubitcoin ? 5 : 1,
        toAddresses: [taprootAddress],
        fromAddresses: [segwitAddress, taprootAddress].filter(Boolean) as string[],
        changeAddress: segwitAddress || taprootAddress,
        alkanesChangeAddress: taprootAddress,
      });

      const txId = result?.txid || result?.reveal_txid || '';
      showMessage(txId ? `✅ DIESEL minted! TX: ${txId.slice(0, 16)}...` : '✅ DIESEL minted!');

      queryClient.invalidateQueries().catch(() => {});
    } catch (error) {
      console.error('[DIESEL] Error:', error);
      showMessage(`❌ Failed to mint DIESEL: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const mintFrBtc = async () => {
    setMining(true);
    try {
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      const wasm = await import('@alkanes/ts-sdk/wasm');
      const providerName = network === 'subfrost-regtest' ? 'subfrost-regtest' : 'regtest';
      const isLocalNetwork = network === 'regtest-local' || network === 'devnet';
      const isQubitcoin = network === 'qubitcoin-regtest';
      const rpcUrl = isLocalNetwork
        ? 'http://localhost:18888'
        : isQubitcoin
          ? `${window.location.origin}/api/rpc/qubitcoin-regtest`
          : 'https://regtest.subfrost.io/v4/subfrost';
      const configOverrides = { jsonrpc_url: rpcUrl, data_api_url: rpcUrl };
      const execProvider = new wasm.WebProvider(providerName, configOverrides);

      const sessionMnemonic = sessionStorage.getItem('subfrost_session_mnemonic')
        || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      execProvider.walletLoadMnemonic(sessionMnemonic, null);

      // Use SDK's alkanesWrapBtc which handles the special frBTC wrap flow:
      // sends BTC to the frBTC signer address, calls opcode 77 (exchange)
      const result = await execProvider.alkanesWrapBtc(JSON.stringify({
        amount: 10_000_000, // 0.1 BTC in sats
        to_address: taprootAddress,
        from_addresses: [segwitAddress, taprootAddress].filter(Boolean),
        change_address: segwitAddress || taprootAddress,
        fee_rate: isQubitcoin ? 5 : 1,
        lock_alkanes: true,
        mine_enabled: true,
        auto_confirm: true,
        raw_output: false,
        trace_enabled: false,
      }));

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const txId = parsed?.txid || '';
      showMessage(txId ? `✅ frBTC minted (0.1 BTC)! TX: ${txId.slice(0, 16)}...` : '✅ frBTC minted!');

      queryClient.invalidateQueries().catch(() => {});
    } catch (error) {
      console.error('[frBTC] Error:', error);
      showMessage(`❌ Failed to mint frBTC: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const networkLabel = network === 'subfrost-regtest' ? 'Subfrost Regtest' :
                       network === 'regtest' ? 'Local Regtest' :
                       network === 'regtest-local' ? 'Local Docker' :
                       network === 'qubitcoin-regtest' ? 'Qubitcoin Regtest' :
                       network === 'devnet' ? 'Devnet' : 'Oylnet';

  return (
    <div className="mt-8 rounded-xl bg-[color:var(--sf-primary)]/5 p-6">
      <div className="flex items-center gap-3 mb-4">
        <Pickaxe size={24} className="text-orange-400" />
        <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('regtest.controls')}</h3>
        <span className="text-sm text-[color:var(--sf-text)]/60">({networkLabel})</span>
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Mine 101 Blocks (coinbase maturity) */}
        <button
          onClick={() => mineBlocks(101)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-orange-500/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Pickaxe size={32} className="text-orange-400" />
          <span className="font-semibold">Mine 101 Blocks</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">{t('regtest.generateBulk')}</span>
        </button>

        {/* Mine 1 Block */}
        <button
          onClick={() => mineBlocks(1)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-[color:var(--sf-primary)]/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Zap size={32} className="text-[color:var(--sf-primary)]" />
          <span className="font-semibold">{t('regtest.mine1Block')}</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">{t('regtest.generateSingle')}</span>
        </button>

        {/* Mine DIESEL */}
        <button
          onClick={mineDiesel}
          disabled={mining || !isWalletLoaded}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-green-500/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Fuel size={32} className="text-green-500" />
          <span className="font-semibold">{t('regtest.mintDiesel')}</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">{t('regtest.freeMintDiesel')}</span>
        </button>

        {/* Mint frBTC */}
        <button
          onClick={mintFrBtc}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-blue-500/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Snowflake size={32} className="text-blue-400" />
          <span className="font-semibold">Mint frBTC</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">Wrap 0.1 BTC</span>
        </button>

        {/* Generate Future */}
        <button
          onClick={generateFuture}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-purple-500/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Clock size={32} className="text-purple-500 dark:text-purple-400" />
          <span className="font-semibold">{t('regtest.generateFuture')}</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">{t('regtest.createFutureBlock')}</span>
        </button>
      </div>

      <div className="mt-4 p-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)]">
        <p className="text-sm text-[color:var(--sf-text)]/60">
          <strong className="text-[color:var(--sf-text)]/80">{t('regtest.note')}</strong> {t('regtest.noteText')}
        </p>
      </div>
    </div>
  );
}
