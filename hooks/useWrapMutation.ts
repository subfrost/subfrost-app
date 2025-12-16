import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

// Default signer pubkey from fr-btc-support (32 bytes x-only pubkey)
// This is the address that must receive BTC for wrap to work
// The frBTC contract checks outputs to this address and mints frBTC based on amount sent
const DEFAULT_SIGNER_PUBKEY = Buffer.from([
  0x79, 0x40, 0xef, 0x3b, 0x65, 0x91, 0x79, 0xa1, 0x37, 0x1d, 0xec, 0x05, 0x79, 0x3c, 0xb0, 0x27,
  0xcd, 0xe4, 0x78, 0x06, 0xfb, 0x66, 0xce, 0x1e, 0x3d, 0x1b, 0x69, 0xd5, 0x6d, 0xe6, 0x29, 0xdc,
]);

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Calculate the signer's P2TR address for the given network
 * The signer address is where BTC must be sent for wrap to work
 * The frBTC contract computes how much BTC was sent to this address and mints equivalent frBTC
 */
function getSignerAddress(btcNetwork: bitcoin.Network): string {
  // Tweak the pubkey for key-path spend (BIP341)
  const signerTweakedPubkey = Buffer.from(
    ecc.xOnlyPointAddTweak(
      DEFAULT_SIGNER_PUBKEY,
      bitcoin.crypto.taggedHash('TapTweak', DEFAULT_SIGNER_PUBKEY)
    )!.xOnlyPubkey
  );

  const signerPayment = bitcoin.payments.p2tr({
    pubkey: signerTweakedPubkey,
    network: btcNetwork,
  });

  return signerPayment.address!;
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
      console.log('[useWrapMutation] Starting wrap', {
        amount: wrapData.amount,
        feeRate: wrapData.feeRate,
        isConnected,
        hasProvider: !!provider,
        FRBTC_ALKANE_ID,
      });

      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // Check if WASM provider wallet is loaded for signing
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      const wrapAmountSats = Math.floor(parseFloat(wrapData.amount) * 100000000);
      console.log('[useWrapMutation] Wrap amount in sats:', wrapAmountSats);

      // Build protostone for wrap operation
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });
      console.log('[useWrapMutation] Built protostone:', protostone);

      // Input requirements: Explicitly assign full wrap amount to output v1 (signer)
      // NEW: signer is now at v1, user is at v0
      // Using B:amount:vN format ensures the full amount goes to the specific output
      // Without :vN, the SDK splits the amount equally across all to_addresses
      const inputRequirements = `B:${wrapAmountSats}:v1`;
      console.log('[useWrapMutation] Input requirements:', inputRequirements);
      console.log('[useWrapMutation] Full', wrapAmountSats, 'sats assigned to v1 (signer)');

      // Get user's taproot address (receives minted frBTC)
      const userTaprootAddress = account?.taproot?.address;
      if (!userTaprootAddress) throw new Error('No taproot address available');
      console.log('[useWrapMutation] User taproot address:', userTaprootAddress);

      // Get bitcoin network to calculate signer address
      const btcNetwork = getBitcoinNetwork();

      // Calculate the signer address - this is where BTC must be sent for wrap to work
      // The frBTC contract checks outputs to this address and mints frBTC based on amount sent
      const signerAddress = getSignerAddress(btcNetwork);
      console.log('[useWrapMutation] Signer address:', signerAddress);

      // to_addresses: [user, signer]
      // - Output 0 (v0): user address (receives minted frBTC via pointer=v0)
      // - Output 1 (v1): signer address (receives full wrap BTC amount via B:amount:v1)
      // NOTE: User is FIRST (v0) so pointer=v0 sends frBTC to user
      const toAddresses = JSON.stringify([userTaprootAddress, signerAddress]);
      console.log('[useWrapMutation] to_addresses: v0=user, v1=signer');

      // Get taproot address for UTXOs - this is where the funds are
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available for UTXOs');
      console.log('[useWrapMutation] From address (taproot):', taprootAddress);

      // WORKAROUND: Fetch UTXOs ourselves and filter to only our wallet's address
      // This bypasses the SDK's broken UTXO selection
      console.log('[useWrapMutation] ========================================');
      console.log('[useWrapMutation] Fetching wallet UTXOs directly from:', taprootAddress);
      let walletUtxos: any[] = [];
      try {
        // Get UTXOs from the wallet's taproot address
        const utxoResult = await provider.getAddressUtxos(taprootAddress);
        console.log('[useWrapMutation] Raw UTXO result type:', typeof utxoResult);
        console.log('[useWrapMutation] Raw UTXO result:', JSON.stringify(utxoResult, null, 2));

        // Handle different response formats
        if (Array.isArray(utxoResult)) {
          walletUtxos = utxoResult;
        } else if (utxoResult?.utxos) {
          walletUtxos = utxoResult.utxos;
        } else if (utxoResult instanceof Map) {
          walletUtxos = Array.from(utxoResult.values());
        }

        console.log('[useWrapMutation] Found', walletUtxos.length, 'UTXOs for wallet');
        walletUtxos.forEach((utxo, idx) => {
          console.log(`[useWrapMutation]   UTXO[${idx}]: ${utxo.txid}:${utxo.vout} value=${utxo.value} sats`);
        });
      } catch (e) {
        console.error('[useWrapMutation] Failed to fetch UTXOs:', e);
      }

      // If we have wallet UTXOs, include them in options
      const options: Record<string, any> = {
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: true,  // Let SDK handle signing to test if OP_RETURN is correct
        change_address: userTaprootAddress,  // Change goes to user's taproot address
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
        console.log('[useWrapMutation] Passing', formattedUtxos.length, 'explicit UTXOs to SDK');
      }

      const optionsJson = JSON.stringify(options);
      console.log('[useWrapMutation] Options:', optionsJson);

      console.log('[useWrapMutation] Calling alkanesExecuteWithStrings...');
      console.log('[useWrapMutation] Execute params:', {
        toAddresses,
        inputRequirements,
        protostone,
        feeRate: wrapData.feeRate,
        options: optionsJson,
      });

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

        console.log('[useWrapMutation] Result:', result);

        // Check if execution completed (auto_confirm: true path)
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[useWrapMutation] Execution complete (auto_confirm), txid:', txId);
          return {
            success: true,
            transactionId: txId,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
        }

        // Check if we got a readyToSign state (auto_confirm: false path)
        if (result?.readyToSign) {
          console.log('[useWrapMutation] Got readyToSign state, signing transaction...');
          const readyToSign = result.readyToSign;

          // The PSBT comes as Uint8Array from serde_wasm_bindgen
          let psbtBase64: string;
          if (readyToSign.psbt instanceof Uint8Array) {
            psbtBase64 = uint8ArrayToBase64(readyToSign.psbt);
          } else if (typeof readyToSign.psbt === 'string') {
            // Already base64
            psbtBase64 = readyToSign.psbt;
          } else {
            throw new Error('Unexpected PSBT format');
          }
          console.log('[useWrapMutation] PSBT base64 length:', psbtBase64.length);

          // Debug: Analyze PSBT structure (btcNetwork already declared above)
          try {
            const debugPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            console.log('[useWrapMutation] PSBT has', debugPsbt.inputCount, 'inputs');
            console.log('[useWrapMutation] PSBT has', debugPsbt.txOutputs.length, 'outputs');
            console.log('[useWrapMutation] Wallet taproot address:', taprootAddress);
            console.log('[useWrapMutation] Wallet has', walletUtxos.length, 'UTXOs');

            // Check if input count matches wallet UTXOs (indicates SDK respecting our filter)
            if (debugPsbt.inputCount > walletUtxos.length + 5) {
              console.warn('[useWrapMutation] WARNING: PSBT has more inputs than wallet UTXOs!');
              console.warn('[useWrapMutation] SDK may be ignoring from_addresses filter');
            }

            // Log first input details
            if (debugPsbt.data.inputs[0]) {
              const inp = debugPsbt.data.inputs[0];
              console.log('[useWrapMutation] First input has witnessUtxo:', !!inp.witnessUtxo);
              console.log('[useWrapMutation] First input has tapInternalKey:', !!inp.tapInternalKey);
              console.log('[useWrapMutation] First input has tapBip32Derivation:', !!inp.tapBip32Derivation);

              // Compare PSBT's tapInternalKey with wallet's pubkey
              const walletPubKey = account?.taproot?.pubKeyXOnly;
              const walletHdPath = account?.taproot?.hdPath;
              if (inp.tapInternalKey) {
                const psbtKey = Buffer.from(inp.tapInternalKey).toString('hex');
                console.log('[useWrapMutation] PSBT tapInternalKey:', psbtKey);
                console.log('[useWrapMutation] Wallet pubKeyXOnly:', walletPubKey);
                console.log('[useWrapMutation] Wallet hdPath:', walletHdPath);
                console.log('[useWrapMutation] Keys match:', psbtKey === walletPubKey);
              }
              if (inp.tapBip32Derivation && inp.tapBip32Derivation.length > 0) {
                const deriv = inp.tapBip32Derivation[0];
                console.log('[useWrapMutation] PSBT BIP32 path:', deriv.path);
                console.log('[useWrapMutation] PSBT BIP32 pubkey:', Buffer.from(deriv.pubkey).toString('hex'));
                console.log('[useWrapMutation] PSBT BIP32 masterFingerprint:', Buffer.from(deriv.masterFingerprint).toString('hex'));
              }
            }
          } catch (dbgErr) {
            console.log('[useWrapMutation] PSBT debug parse error:', dbgErr);
          }

          // Sign the PSBT directly without modification (same as test does)
          // Modifying PSBT may corrupt the OP_RETURN output
          console.log('[useWrapMutation] Signing PSBT with taproot key...');
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          console.log('[useWrapMutation] PSBT signed with taproot key');

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

          // Finalize all inputs
          console.log('[useWrapMutation] Finalizing PSBT...');
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          // Debug: Log detailed transaction structure
          console.log('[useWrapMutation] ========================================');
          console.log('[useWrapMutation] TRANSACTION DETAILS FOR INDEXER DEBUG');
          console.log('[useWrapMutation] ========================================');
          console.log('[useWrapMutation] Transaction ID:', txid);
          console.log('[useWrapMutation] Transaction hex:', txHex);
          console.log('[useWrapMutation] Number of inputs:', tx.ins.length);
          console.log('[useWrapMutation] Number of outputs:', tx.outs.length);

          // Analyze each output
          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            let outputType = 'unknown';
            let address = 'N/A';
            let opReturnData = null;

            try {
              // Check if OP_RETURN (starts with 6a)
              if (script.startsWith('6a')) {
                outputType = 'OP_RETURN';
                // Parse OP_RETURN data (skip 6a opcode and length byte)
                const dataHex = script.slice(4); // Skip 6a and length
                opReturnData = Buffer.from(dataHex, 'hex').toString('utf8');
              } else {
                // Try to decode as address
                address = bitcoin.address.fromOutputScript(output.script, btcNetwork);

                // Determine output type
                if (address.startsWith('bc1p') || address.startsWith('tb1p') || address.startsWith('bcrt1p')) {
                  outputType = 'P2TR (taproot)';
                } else if (address.startsWith('bc1') || address.startsWith('tb1') || address.startsWith('bcrt1')) {
                  outputType = 'P2WPKH (segwit)';
                }
              }
            } catch (e) {
              outputType = 'unparseable';
            }

            console.log(`[useWrapMutation] Output ${idx}:`, {
              type: outputType,
              address,
              value: output.value,
              scriptHex: script.slice(0, 100) + (script.length > 100 ? '...' : ''),
              opReturnData,
            });

            // Check if this output matches expected addresses
            if (address === userTaprootAddress) {
              console.log(`[useWrapMutation]   ✓ Output ${idx} is USER address (should receive frBTC via pointer)`);
            }
            if (address === signerAddress) {
              console.log(`[useWrapMutation]   ✓ Output ${idx} is SIGNER address (BTC for wrap - CRITICAL for indexer)`);
            }
          });

          console.log('[useWrapMutation] Expected protostone:', protostone);
          console.log('[useWrapMutation] Expected signer address:', signerAddress);
          console.log('[useWrapMutation] Expected user address:', userTaprootAddress);
          console.log('[useWrapMutation] ========================================');

          // Broadcast the transaction
          console.log('[useWrapMutation] Broadcasting transaction...');
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[useWrapMutation] Transaction broadcast successful');
          console.log('[useWrapMutation] Broadcast returned txid:', broadcastTxid);

          if (txid !== broadcastTxid) {
            console.warn('[useWrapMutation] WARNING: Computed txid !== broadcast txid!');
            console.warn('[useWrapMutation] Computed:', txid);
            console.warn('[useWrapMutation] Broadcast:', broadcastTxid);
          }

          // Return the txid from broadcast (should match computed txid)
          return {
            success: true,
            transactionId: broadcastTxid || txid,
            wrapAmountSats,
            txHex, // Include raw hex for debugging
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number; txHex?: string };
        }

        // Check if execution completed directly (unlikely for wrap, but handle it)
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[useWrapMutation] Execution complete, txid:', txId);
          return {
            success: true,
            transactionId: txId,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
        }

        // Fallback: try to get txid directly from result
        const txId = result?.txid || result?.reveal_txid;
        console.log('[useWrapMutation] Transaction ID:', txId);

        return {
          success: true,
          transactionId: txId,
          wrapAmountSats,
        } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
      } catch (error) {
        console.error('[useWrapMutation] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[useWrapMutation] Wrap successful');
      console.log('[useWrapMutation] Transaction ID:', data.transactionId);
      console.log('[useWrapMutation] Amount wrapped:', data.wrapAmountSats, 'sats');

      // Invalidate balance queries - balance will update when indexer processes the transaction
      const walletAddress = account?.taproot?.address;

      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });

      console.log('[useWrapMutation] Balance queries invalidated. Balance will update when indexer processes block.');
    },
  });
}
