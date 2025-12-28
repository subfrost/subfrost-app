import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';

// Helper to recursively convert serde_wasm_bindgen Maps to plain objects
// The WASM SDK returns nested Maps that need to be converted
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  // Handle objects with numeric keys (WASM sometimes returns these for arrays)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    // Check if this looks like an array (all numeric keys)
    if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
      // Could be a pseudo-array, check if sequential
      const numKeys = keys.map(Number).sort((a, b) => a - b);
      if (numKeys[0] === 0 && numKeys[numKeys.length - 1] === numKeys.length - 1) {
        // It's a pseudo-array, convert to real array
        return numKeys.map(k => mapToObject(value[k]));
      }
    }
    // Regular object, convert each property
    const obj: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  return value;
}

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Hardcoded signer addresses per network
// These are the multisig addresses configured in each frBTC contract deployment
// NOTE: These addresses depend on how the frBTC contract was deployed on each network.
// For regtest, this was found by examining successful wrap transactions.
// If wraps fail, verify the signer address matches the contract's configured signer.
const SIGNER_ADDRESSES: Record<string, string> = {
  'regtest': 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft',
  'subfrost-regtest': 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft',
  'oylnet': 'bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft',
};

/**
 * Get the signer address for the frBTC contract
 * Uses hardcoded addresses since simulate calls don't work reliably on regtest
 */
function getSignerAddress(network: string): string {
  const signer = SIGNER_ADDRESSES[network];
  if (!signer) {
    throw new Error(`No signer address configured for network: ${network}`);
  }
  console.log('[WRAP] Using signer address:', signer);
  return signer;
}

/**
 * Build protostone string for BTC -> frBTC wrap operation
 * Format: [frbtc_block,frbtc_tx,opcode(77)]:pointer:refund
 * Opcode 77 is the exchange/wrap opcode for frBTC contract
 *
 * For wrap transactions (output ordering):
 *   - Output 0 (v0): signer address (receives BTC - triggers frBTC minting)
 *   - Output 1 (v1): user address (receives minted frBTC via pointer=v1)
 *   - Output 2+: change, OP_RETURN
 *
 * IMPORTANT: The signer address must receive the full BTC wrap amount.
 * NEW OUTPUT ORDER: User at v0 (receives frBTC), Signer at v1 (receives BTC).
 * The frBTC contract checks BTC sent to signer and mints frBTC to pointer output (v0=user).
 */
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  // pointer: output index where minted frBTC should go
  // refund: output index where refunds should go
  //
  // NEW OUTPUT ORDERING - user first, signer second:
  //   - Output 0 (v0): user address (receives frBTC via pointer=v0)
  //   - Output 1 (v1): signer address (receives BTC via B:amount:v1)
  //
  // pointer=v0 ensures frBTC goes to user at output 0
  const { frbtcId, pointer = 'v0', refund = 'v0' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(77)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');

  // Format: [cellpack]:pointer:refund
  return `[${cellpack}]:${pointer}:${refund}`;
}

export function useWrapMutation() {
  const { account, network, isConnected, signTaprootPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  // Get bitcoin network for PSBT parsing
  const getBitcoinNetwork = () => {
    switch (network) {
      case 'mainnet':
        return bitcoin.networks.bitcoin;
      case 'testnet':
      case 'signet':
        return bitcoin.networks.testnet;
      case 'regtest':
      case 'subfrost-regtest':
      case 'oylnet':
        return bitcoin.networks.regtest;
      default:
        return bitcoin.networks.bitcoin;
    }
  };

  return useMutation({
    mutationFn: async (wrapData: WrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Check if WASM provider wallet is loaded for signing
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      const wrapAmountSats = Math.floor(parseFloat(wrapData.amount) * 100000000);
      console.log('[WRAP] Starting wrap:', wrapAmountSats, 'sats');

      // Build protostone for wrap operation
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });
      console.log('[WRAP] Protostone:', protostone, '(frbtcId:', FRBTC_ALKANE_ID, ')');

      // Input requirements: BTC amount in sats directed to specific output
      // Format is "B:amount:v1" - direct all BTC to output v1 (signer address)
      // Output v0 (user) receives dust (546 sats) to hold the minted frBTC
      // Output v1 (signer) receives the full wrap amount
      const inputRequirements = `B:${wrapAmountSats}:v1`;

      // Get user's taproot address (receives minted frBTC)
      const userTaprootAddress = account?.taproot?.address;
      if (!userTaprootAddress) throw new Error('No taproot address available');

      // Get bitcoin network for PSBT parsing
      const btcNetwork = getBitcoinNetwork();

      // Get the signer address for this network (hardcoded per network)
      const signerAddress = getSignerAddress(network);

      // to_addresses: [user, signer]
      // - Output 0 (v0): user address (receives minted frBTC via pointer=v0)
      // - Output 1 (v1): signer address (receives full wrap BTC amount via B:amount:v1)
      // NOTE: User is FIRST (v0) so pointer=v0 sends frBTC to user
      const toAddresses = JSON.stringify([userTaprootAddress, signerAddress]);

      // Get taproot address for UTXOs - this is where the funds are
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available for UTXOs');

      // Fetch UTXOs for the wallet
      let walletUtxos: any[] = [];
      try {
        const utxoResult = await provider.getAddressUtxos(taprootAddress);
        const convertedResult = mapToObject(utxoResult);

        if (Array.isArray(convertedResult)) {
          walletUtxos = convertedResult;
        } else if (convertedResult?.utxos) {
          walletUtxos = convertedResult.utxos;
        } else if (convertedResult instanceof Map) {
          walletUtxos = Array.from(convertedResult.values());
        }

        walletUtxos = walletUtxos.filter((utxo: any) => utxo && utxo.txid && typeof utxo.value === 'number');
      } catch (e) {
        console.error('[WRAP] Failed to fetch UTXOs:', e);
      }

      // If we have wallet UTXOs, include them in options
      // Use the actual taproot address for change (not symbolic notation which may cause issues)
      const options: Record<string, any> = {
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: false,  // We'll handle signing ourselves
        change_address: taprootAddress,  // Use actual taproot address for change
        from: [taprootAddress],
        from_addresses: [taprootAddress],
        lock_alkanes: true,
      };

      // Pass explicit UTXOs if available
      if (walletUtxos.length > 0) {
        // Format UTXOs for the SDK
        const formattedUtxos = walletUtxos.map((utxo: any) => ({
          txid: utxo.txid,
          vout: utxo.vout,
          value: utxo.value,
          script: utxo.scriptpubkey || utxo.script,
        }));
        options.utxos = formattedUtxos;
        options.explicit_utxos = formattedUtxos;
      }

      const optionsJson = JSON.stringify(options);

      try {
        // Execute using alkanesExecuteWithStrings
        const result = await provider.alkanesExecuteWithStrings(
          toAddresses,
          inputRequirements,
          protostone,
          wrapData.feeRate,
          undefined, // envelope_hex
          optionsJson
        );

        // Check if execution completed (auto_confirm: true path)
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[WRAP] Complete (auto_confirm), txid:', txId);
          return {
            success: true,
            transactionId: txId,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
        }

        // Check if we got a readyToSign state (auto_confirm: false path)
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

          // Sign the PSBT
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          // Log transaction outputs for debugging frBTC balance issue
          console.log('[WRAP] Transaction built:', txid);
          console.log('[WRAP] Outputs:');
          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            if (script.startsWith('6a')) {
              console.log(`  [${idx}] OP_RETURN (protostone)`);
            } else {
              try {
                const addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
                const label = addr === userTaprootAddress ? 'USER (receives frBTC)' :
                             addr === signerAddress ? 'SIGNER (receives BTC)' : 'OTHER';
                console.log(`  [${idx}] ${label}: ${output.value} sats -> ${addr}`);
              } catch {
                console.log(`  [${idx}] Unknown: ${output.value} sats`);
              }
            }
          });

          // Broadcast the transaction
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[WRAP] Broadcast successful:', broadcastTxid);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
            wrapAmountSats,
            txHex,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number; txHex?: string };
        }

        // Check if execution completed directly
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[WRAP] Complete, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[WRAP] Transaction ID:', txId);

        return {
          success: true,
          transactionId: txId,
          wrapAmountSats,
        } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
      } catch (error) {
        console.error('[WRAP] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[WRAP] Success! txid:', data.transactionId, 'amount:', data.wrapAmountSats, 'sats');

      // Invalidate balance queries - balance will update when indexer processes the transaction
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });

      console.log('[WRAP] Balance queries invalidated - waiting for indexer to process block');
    },
  });
}
