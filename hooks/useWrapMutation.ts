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


const toAlks = (amount: string): string => {
  if (!amount) return '0';
  // 8 decimal places for alks/sats
  const parts = amount.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(8, '0').slice(0, 8);
  // remove leading zeros from whole to avoid Number parsing issues later
  const normalizedWhole = whole.replace(/^0+(\d)/, '$1');
  return `${normalizedWhole || '0'}${frac ? frac.padStart(8, '0') : '00000000'}`;
};

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
 * For wrap transactions:
 *   - Output 0: user address (receives minted frBTC via pointer=v0)
 *   - Output 1: signer address (receives BTC - must be explicitly included)
 *   - Output 2+: change, OP_RETURN
 *
 * IMPORTANT: The signer address MUST be included in to_addresses.
 * The SDK does NOT add it automatically. The frBTC contract checks
 * that BTC was sent to the signer address before minting frBTC.
 */
function buildWrapProtostone(params: {
  frbtcId: string;
  pointer?: string;
  refund?: string;
}): string {
  // pointer=v0: frBTC goes to output 0 (user's address)
  // refund=v0: refunds also go to output 0 (user's address)
  const { frbtcId, pointer = 'v0', refund = 'v0' } = params;
  const [frbtcBlock, frbtcTx] = frbtcId.split(':');

  // Build cellpack: [frbtc_block, frbtc_tx, opcode(77)]
  const cellpack = [frbtcBlock, frbtcTx, FRBTC_WRAP_OPCODE].join(',');

  return `[${cellpack}]:${pointer}:${refund}`;
}

export function useWrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, getSpendableUtxos } = useWallet();
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

      // Input requirements: Bitcoin amount to wrap
      const inputRequirements = `B:${wrapAmountSats}`;
      console.log('[useWrapMutation] Input requirements:', inputRequirements);

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
      // - Output 0: user address (receives minted frBTC via pointer=v0)
      // - Output 1: signer address (receives BTC - triggers frBTC minting)
      // IMPORTANT: The signer address MUST be included - SDK does NOT add it automatically
      const toAddresses = JSON.stringify([userTaprootAddress, signerAddress]);

      // Get taproot address for UTXOs - this is where the funds are
      const taprootAddress = account?.taproot?.address;
      if (!taprootAddress) throw new Error('No taproot address available for UTXOs');
      console.log('[useWrapMutation] From address (taproot):', taprootAddress);

      // WORKAROUND: Fetch UTXOs ourselves and filter to only our wallet's address
      // This bypasses the SDK's broken UTXO selection
      console.log('[useWrapMutation] Fetching wallet UTXOs directly...');
      let walletUtxos: any[] = [];
      try {
        // Get UTXOs from the wallet's taproot address
        const utxoResult = await provider.getAddressUtxos(taprootAddress);
        console.log('[useWrapMutation] Raw UTXO result:', utxoResult);

        // Handle different response formats
        if (Array.isArray(utxoResult)) {
          walletUtxos = utxoResult;
        } else if (utxoResult?.utxos) {
          walletUtxos = utxoResult.utxos;
        } else if (utxoResult instanceof Map) {
          walletUtxos = Array.from(utxoResult.values());
        }

        console.log('[useWrapMutation] Found', walletUtxos.length, 'UTXOs for wallet');
      } catch (e) {
        console.error('[useWrapMutation] Failed to fetch UTXOs:', e);
      }

      // If we have wallet UTXOs, include them in options
      const options: Record<string, any> = {
        trace_enabled: false,
        mine_enabled: false,
        auto_confirm: false,  // We sign manually with taproot key
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

        // Check if we got a readyToSign state (transaction needs signing)
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
          console.log('[useWrapMutation] Extracted tx hex, broadcasting...');

          // Broadcast the transaction
          const txid = await provider.broadcastTransaction(txHex);
          console.log('[useWrapMutation] Transaction broadcast, txid:', txid);

          return {
            success: true,
            transactionId: txid,
            wrapAmountSats,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number };
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
