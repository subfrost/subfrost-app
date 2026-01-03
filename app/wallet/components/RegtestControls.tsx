'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { Pickaxe, Clock, Zap, Fuel } from 'lucide-react';
import * as bitcoin from 'bitcoinjs-lib';

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
  const { network, account, refreshBalances, signTaprootPsbt } = useWallet() as any;
  const { provider, isWalletLoaded } = useAlkanesSDK();
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

      // Use the API route which bypasses WASM issues
      const response = await fetch('/api/regtest/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: count, address }),
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to mine blocks');
      }

      console.log('[RegtestControls] Mined blocks:', result);
      showMessage(`✅ Mined ${count} block(s) successfully! Waiting for indexer...`);

      // Wait for indexer to process blocks (typically takes 1-3 seconds)
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Invalidate all queries to refresh data
      // Invalidate multiple times over 10 seconds to handle backend cache delays
      for (let i = 0; i < 3; i++) {
        await queryClient.invalidateQueries();
        if (refreshBalances) {
          await refreshBalances();
        }
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      showMessage(`✅ Mined ${count} block(s) and refreshed balances!`);
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

      // No input requirements for DIESEL mint (it's free)
      const inputRequirements = '';

      // to_addresses: just the user's taproot address
      const toAddresses = JSON.stringify([taprootAddress]);

      // Options for the SDK
      const options: Record<string, any> = {
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: false, // We'll handle signing ourselves
        change_address: taprootAddress,
        alkanes_change_address: taprootAddress,
        from: [taprootAddress],
        from_addresses: [taprootAddress],
      };
      const optionsJson = JSON.stringify(options);

      // Execute the DIESEL mint
      const result = await provider.alkanesExecuteWithStrings(
        toAddresses,
        inputRequirements,
        protostone,
        10, // fee rate
        null, // envelope_hex
        optionsJson
      );

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

        showMessage(`✅ DIESEL minted! TX: ${(broadcastTxid || txid).slice(0, 16)}...`);

        // Mine a block to confirm
        await mineBlocks(1);

      } else if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        console.log('[DIESEL] Complete, txid:', txId);
        showMessage(`✅ DIESEL minted! TX: ${txId?.slice(0, 16)}...`);
      } else {
        throw new Error('Unexpected result format');
      }

      // Refresh balances
      await queryClient.invalidateQueries();
      if (refreshBalances) {
        await refreshBalances();
      }

    } catch (error) {
      console.error('[DIESEL] Mining error:', error);
      showMessage(`❌ Failed to mint DIESEL: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
    } finally {
      setMining(false);
    }
  };

  const networkLabel = network === 'subfrost-regtest' ? 'Subfrost Regtest' :
                       network === 'regtest' ? 'Local Regtest' : 'Oylnet';

  return (
    <div className="mt-8 rounded-xl bg-[color:var(--sf-primary)]/5 p-6">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* Mine DIESEL */}
        <button
          onClick={mineDiesel}
          disabled={mining || !isWalletLoaded}
          className="flex flex-col items-center gap-2 p-4 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] hover:border-green-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[color:var(--sf-text)]"
        >
          <Fuel size={32} className="text-green-500" />
          <span className="font-semibold">Mint DIESEL</span>
          <span className="text-sm text-[color:var(--sf-text)]/60">Free-mint DIESEL (2:0)</span>
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
