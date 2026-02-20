'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { Pickaxe, Clock, Zap, Fuel } from 'lucide-react';
import * as bitcoin from 'bitcoinjs-lib';
import { useTranslation } from '@/hooks/useTranslation';

// DIESEL token ID (2:0) - the free-mint alkane token
const DIESEL_ID = '2:0';
const DIESEL_MINT_OPCODE = 77;

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default function RegtestControls() {
  const { network, account, signTaprootPsbt } = useWallet();
  const { provider, isWalletLoaded } = useAlkanesSDK();
  const extendedProvider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [mining, setMining] = useState(false);
  const [message, setMessage] = useState('');

  // Only show for regtest networks (local regtest, subfrost-regtest, oylnet, regtest-local)
  if (network !== 'regtest' && network !== 'subfrost-regtest' && network !== 'oylnet' && network !== 'regtest-local') {
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
          body: JSON.stringify({ blocks: remaining, address }),
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
      if (!provider) {
        throw new Error('Provider not initialized');
      }
      if (!isWalletLoaded) {
        throw new Error('Wallet not loaded into provider. Please reconnect.');
      }

      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) {
        throw new Error('No taproot address available');
      }

      console.log('[DIESEL] Starting DIESEL mint for:', taprootAddress);

      // Build protostone: [2,0,77]:v0:v0
      // - [2,0,77]: call DIESEL contract (2:0) with opcode 77 (mint)
      // - v0: pointer - minted tokens go to output 0 (user)
      // - v0: refund - any refunds go to output 0 (user)
      const [dieselBlock, dieselTx] = DIESEL_ID.split(':');
      const protostone = `[${dieselBlock},${dieselTx},${DIESEL_MINT_OPCODE}]:v0:v0`;

      console.log('[DIESEL] Protostone:', protostone);

      if (!extendedProvider) {
        throw new Error('Extended provider not initialized');
      }

      // Execute the DIESEL mint using alkanesExecuteTyped
      const result = await extendedProvider.alkanesExecuteTyped({
        inputRequirements: '',
        protostones: protostone,
        feeRate: 10,
        toAddresses: [taprootAddress],
        fromAddresses: [taprootAddress],
        changeAddress: taprootAddress,
        alkanesChangeAddress: taprootAddress,
        autoConfirm: false, // We'll handle signing ourselves
      });

      console.log('[DIESEL] Execution result:', result);

      // Handle readyToSign response
      if (result?.readyToSign) {
        const readyToSign = result.readyToSign;

        // The PSBT comes as Uint8Array from serde_wasm_bindgen
        let psbtBase64: string;
        if (readyToSign.psbt instanceof Uint8Array) {
          psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
        } else if (typeof readyToSign.psbt === 'string') {
          psbtBase64 = readyToSign.psbt;
        } else {
          throw new Error('Unexpected PSBT format');
        }

        console.log('[DIESEL] Signing PSBT...');

        // Sign with taproot key
        const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

        // Parse the signed PSBT, finalize, and extract the raw transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: bitcoin.networks.regtest });
        signedPsbt.finalizeAllInputs();

        // Extract the raw transaction
        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();

        console.log('[DIESEL] Transaction built:', txid);

        // Broadcast the transaction
        const broadcastTxid = await provider.broadcastTransaction(txHex);
        console.log('[DIESEL] Broadcast successful:', broadcastTxid);

        showMessage(`✅ DIESEL minted! TX: ${(broadcastTxid || txid).slice(0, 16)}... Mine a block to confirm.`);

      } else if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        console.log('[DIESEL] Complete, txid:', txId);
        showMessage(`✅ DIESEL minted! TX: ${txId?.slice(0, 16)}...`);
      } else {
        throw new Error('Unexpected result format');
      }

      // Refresh balances (fire and forget to prevent hanging)
      queryClient.invalidateQueries().catch((err) => {
        console.warn('[DIESEL] Query invalidation error (non-fatal):', err);
      });

    } catch (error) {
      console.error('[DIESEL] Mining error:', error);
      showMessage(`❌ Failed to mint DIESEL: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const networkLabel = network === 'subfrost-regtest' ? 'Subfrost Regtest' :
                       network === 'regtest' ? 'Local Regtest' :
                       network === 'regtest-local' ? 'Local Docker' : 'Oylnet';

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Mine 200 Blocks */}
        <button
          onClick={() => mineBlocks(200)}
          disabled={mining}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-orange-500/50 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Pickaxe size={32} className="text-orange-400" />
          <span className="font-semibold">{t('regtest.mine200Blocks')}</span>
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
