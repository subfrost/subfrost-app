/**
 * useWrapMutation - Wrap BTC into frBTC
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## Implementation Note (2026-01-28)
 *
 * Uses alkanesExecuteTyped from the extended provider for cleaner parameter handling.
 * Uses symbolic addresses (p2tr:0, p2wpkh:0) for user addresses.
 *
 * ## Critical: Output Ordering & Signer Address (2026-01-28)
 *
 * The wrap transaction MUST match the CLI (wrap_btc.rs) output ordering:
 *
 *   - Output 0 (v0): Signer address — receives BTC via `B:amount:v0`
 *   - Output 1 (v1): User taproot address — receives minted frBTC via pointer=v1
 *
 * The protostone is `[32,0,77]:v1:v1` meaning:
 *   - Cellpack: frBTC contract [32:0], opcode 77 (wrap)
 *   - pointer=v1: minted frBTC goes to output 1 (user)
 *   - refund=v1: refunds go to output 1 (user)
 *
 * `inputRequirements = "B:<sats>:v0"` explicitly assigns BTC value to output 0 (signer).
 *
 * ### Signer Address
 *
 * The signer address is the P2TR address derived from the frBTC contract's GET_SIGNER
 * opcode (103). The CLI fetches this dynamically via `get_subfrost_address()` in
 * `subfrost.rs`, which calls opcode 103 on [32:0], receives a 32-byte x-only pubkey,
 * and converts it to a P2TR (bc1p...) address.
 *
 * For the frontend, we hardcode this address per network. If the frBTC contract is
 * redeployed with a different signer key, this address MUST be updated. You can
 * obtain the correct address by running:
 *
 *   alkanes-cli -p subfrost-regtest wrap-btc --amount 1000 --fee-rate 1
 *
 * and observing which address the CLI sends BTC to at output 0.
 *
 * ### Debugging History
 *
 * The original bug was that BTC was sent but frBTC was never minted. Root cause:
 * a stale hardcoded signer address. The frBTC contract only mints when BTC arrives
 * at its expected signer address. A wrong address means BTC is lost to an unrelated
 * output and the contract sees no incoming BTC. The protostone encoding (two-layer
 * Protocol field with ProtoPointer/Refund inside Protocol tag 16383) was correct
 * all along — both WASM and CLI share the same Rust encoding path.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

// Helper to convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

// frBTC wrap opcode (exchange BTC for frBTC)
const FRBTC_WRAP_OPCODE = 77;

// Signer addresses per network - fetched from frBTC contract opcode 103 (GET_SIGNER)
// The CLI derives this dynamically via get_subfrost_address().
// Must match the address the frBTC contract expects BTC to be sent to.
const SIGNER_ADDRESSES: Record<string, string> = {
  'mainnet': 'bc1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqcdrpr6',
  'regtest': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  'subfrost-regtest': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
  'oylnet': 'bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz',
};

function getSignerAddress(network: string): string {
  const signer = SIGNER_ADDRESSES[network];
  if (!signer) {
    throw new Error(`No signer address configured for network: ${network}`);
  }
  return signer;
}

/**
 * Build protostone string for BTC -> frBTC wrap operation
 * Format: [cellpack]:pointer:refund
 *
 * Output ordering matches CLI wrap_btc.rs:
 *   - Output 0 (v0): signer address (receives BTC via B:amount:v0)
 *   - Output 1 (v1): user address (receives minted frBTC via pointer=v1)
 */
function buildWrapProtostone(params: {
  frbtcId: string;
}): string {
  const [frbtcBlock, frbtcTx] = params.frbtcId.split(':');
  const cellpack = `${frbtcBlock},${frbtcTx},${FRBTC_WRAP_OPCODE}`;
  // pointer=v1 (user at output 1), refund=v1 (user at output 1)
  return `[${cellpack}]:v1:v1`;
}

export function useWrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
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
      case 'regtest-local':
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

      // Build protostone: [32,0,77]:v1:v1
      // pointer=v1 sends minted frBTC to output 1 (user)
      // refund=v1 sends any refund to output 1 (user)
      const protostone = buildWrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      // Input requirements: BTC amount assigned to output v0 (signer)
      // B:amount:v0 tells the SDK to set output 0's value to the wrap amount
      const inputRequirements = `B:${wrapAmountSats}:v0`;

      // Get user's addresses
      const userTaprootAddress = account?.taproot?.address;
      const userSegwitAddress = account?.nativeSegwit?.address;
      if (!userTaprootAddress) throw new Error('No taproot address available');

      // Get bitcoin network for PSBT parsing
      const btcNetwork = getBitcoinNetwork();

      // Get the signer address for this network
      const signerAddress = getSignerAddress(network);

      const isBrowserWallet = walletType === 'browser';

      // For browser wallets, use actual addresses for UTXO discovery (passed as
      // opaque strings to esplora — no Address parsing, no LegacyAddressTooLong).
      // For keystore wallets, symbolic addresses resolve correctly via loaded mnemonic.
      const fromAddresses = isBrowserWallet
        ? [userSegwitAddress, userTaprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      // toAddresses use symbolic placeholders — the WASM SDK parses these to construct
      // output scripts, and mainnet bech32m addresses trigger LegacyAddressTooLong.
      // All outputs are patched to correct addresses after PSBT construction.
      const toAddresses = ['p2tr:0', 'p2tr:0'];

      console.log('[WRAP] ============ alkanesExecuteTyped CALL ============');
      console.log('[WRAP] to_addresses:', toAddresses);
      console.log('[WRAP] from_addresses:', fromAddresses);
      console.log('[WRAP] input_requirements:', inputRequirements);
      console.log('[WRAP] protostone:', protostone);
      console.log('[WRAP] fee_rate:', wrapData.feeRate);
      console.log('[WRAP] wallet_type:', walletType);
      console.log('[WRAP] ===================================================');

      try {
        const result = await provider.alkanesExecuteTyped({
          toAddresses,
          inputRequirements,
          protostones: protostone,
          feeRate: wrapData.feeRate,
          fromAddresses,
          changeAddress: 'p2wpkh:0',
          alkanesChangeAddress: 'p2tr:0',
          autoConfirm: false,
          traceEnabled: false,
          mineEnabled: false,
        });

        console.log('[WRAP] Execute result:', result);

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

          // Patch PSBT outputs with correct addresses.
          // The WASM SDK can't parse mainnet bech32m addresses (LegacyAddressTooLong),
          // so all outputs used symbolic placeholders. We now replace them:
          //   - Output 0: signer address (receives BTC)
          //   - Other P2TR outputs: user's taproot address
          //   - Other P2WPKH outputs: user's segwit address
          const signerScript = bitcoin.address.toOutputScript(signerAddress, btcNetwork);
          const userTaprootScript = bitcoin.address.toOutputScript(userTaprootAddress, btcNetwork);
          const userSegwitScript = userSegwitAddress
            ? bitcoin.address.toOutputScript(userSegwitAddress, btcNetwork)
            : null;
          const psbtForPatch = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          const outs = (psbtForPatch.data.globalMap.unsignedTx as any).tx.outs;

          // Always patch output 0 with signer address
          outs[0].script = signerScript;

          // For browser wallets, also patch remaining outputs (symbolic resolved to dummy wallet)
          if (isBrowserWallet) {
            for (let i = 1; i < outs.length; i++) {
              const script = Buffer.from(outs[i].script);
              if (script[0] === 0x6a) continue; // Skip OP_RETURN
              if (script[0] === 0x51 && script.length === 34) {
                outs[i].script = userTaprootScript; // P2TR → user taproot
              } else if (script[0] === 0x00 && script.length === 22 && userSegwitScript) {
                outs[i].script = userSegwitScript; // P2WPKH → user segwit
              }
            }
          }

          // For browser wallets with P2SH-P2WPKH payment address (starts with '3' or '2'),
          // add redeemScript to P2SH inputs so the wallet can sign them.
          // The SDK doesn't add redeemScript for external addresses it doesn't have keys for.
          if (isBrowserWallet && account?.nativeSegwit?.pubkey && userSegwitAddress) {
            const isP2SH = userSegwitAddress.startsWith('3') || userSegwitAddress.startsWith('2');
            if (isP2SH) {
              const segwitPubkey = Buffer.from(account.nativeSegwit.pubkey, 'hex');
              const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: segwitPubkey, network: btcNetwork });
              const redeemScript = p2wpkh.output!;

              const p2shScriptPubKey = Buffer.from(bitcoin.address.toOutputScript(userSegwitAddress, btcNetwork));

              for (let i = 0; i < psbtForPatch.data.inputs.length; i++) {
                const input = psbtForPatch.data.inputs[i];
                let prevScript: Buffer | null = null;
                if (input.witnessUtxo) {
                  prevScript = Buffer.from(input.witnessUtxo.script);
                } else if (input.nonWitnessUtxo) {
                  const prevTx = bitcoin.Transaction.fromBuffer(Buffer.from(input.nonWitnessUtxo));
                  const txIn = (psbtForPatch.data.globalMap.unsignedTx as any).tx.ins[i];
                  prevScript = Buffer.from(prevTx.outs[txIn.index].script);
                }
                if (prevScript && prevScript.equals(p2shScriptPubKey)) {
                  psbtForPatch.updateInput(i, { redeemScript });
                  console.log('[WRAP] Added redeemScript to P2SH input', i);
                }
              }
            }
          }

          psbtBase64 = psbtForPatch.toBase64();
          console.log('[WRAP] Patched PSBT (signer + browser wallet:', isBrowserWallet, ')');

          // For keystore wallets, request user confirmation before signing
          if (walletType === 'keystore') {
            console.log('[WRAP] Keystore wallet - requesting user confirmation...');
            const approved = await requestConfirmation({
              type: 'wrap',
              title: 'Confirm Wrap',
              fromAmount: wrapData.amount,
              fromSymbol: 'BTC',
              toAmount: wrapData.amount,
              toSymbol: 'frBTC',
              feeRate: wrapData.feeRate,
            });

            if (!approved) {
              console.log('[WRAP] User rejected transaction');
              throw new Error('Transaction rejected by user');
            }
            console.log('[WRAP] User approved transaction');
          }

          // Sign the PSBT
          console.log('[WRAP] Signing PSBT...');
          let signedPsbtBase64: string;

          if (isBrowserWallet) {
            // Browser wallets sign all input types in a single signPsbt call
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            // Keystore wallets need separate signing for each key type
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

          // Parse the signed PSBT, finalize, and extract the raw transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          // Extract the raw transaction
          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          // Log transaction outputs for debugging
          console.log('[WRAP] Transaction built:', txid);
          console.log('[WRAP] Outputs:');
          tx.outs.forEach((output, idx) => {
            const script = Buffer.from(output.script).toString('hex');
            if (script.startsWith('6a')) {
              console.log(`  [${idx}] OP_RETURN (protostone)`);
              console.log(`        Script hex: ${script}`);
            } else {
              try {
                const addr = bitcoin.address.fromOutputScript(output.script, btcNetwork);
                const label = addr === signerAddress ? 'SIGNER (BTC)' :
                             addr === userTaprootAddress ? 'USER (frBTC)' : 'OTHER';
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

      // Invalidate balance queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[WRAP] Balance queries invalidated');
    },
  });
}
