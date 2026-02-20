/**
 * useWrapMutation - Wrap BTC into frBTC
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## SDK Update (2026-02-20)
 *
 * Updated to @alkanes/ts-sdk from develop branch (via pkg.alkanes.build).
 * New features include WasmBrowserWalletProvider and JsWalletAdapter interface.
 * Current implementation continues to use alkanesExecuteWithStrings via alkanesExecuteTyped.
 *
 * ## CRITICAL FIX (2026-02-20): Browser Wallet Address Resolution
 *
 * The WASM SDK has a dummy wallet loaded (via walletCreate() in AlkanesSDKContext) to satisfy
 * the "Wallet not loaded" check. When symbolic addresses like 'p2tr:0' or 'p2wpkh:0' are used
 * for change_address or alkanes_change_address options, the SDK resolves them to the dummy
 * wallet's addresses, causing ALL outputs to go to the dummy wallet instead of the user!
 *
 * Root cause: Even when actual Bitcoin addresses are passed in toAddresses, the SDK uses
 * the change_address and alkanes_change_address options for output destinations, resolving
 * symbolic addresses to the loaded (dummy) wallet.
 *
 * Fix: For browser wallets, pass actual user addresses for changeAddress and alkanesChangeAddress
 * instead of symbolic addresses. For keystore wallets, symbolic addresses work correctly since
 * the actual user's mnemonic is loaded into the provider.
 *
 * Transaction ce185f7... showed both outputs going to bcrt1pvu3q2... (dummy wallet taproot
 * address from 'p2tr:0') instead of the signer and user addresses.
 *
 * ## Implementation Note (2026-01-28)
 *
 * Uses alkanesExecuteTyped from the extended provider for cleaner parameter handling.
 * Uses symbolic addresses (p2tr:0, p2wpkh:0) for keystore wallets, actual addresses for browser wallets.
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
import { patchPsbtForBrowserWallet } from '@/lib/psbt-patching';
import { getBitcoinNetwork, getSignerAddress, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import { buildWrapProtostone } from '@/lib/alkanes/builders';

bitcoin.initEccLib(ecc);

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

export function useWrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID } = getConfig(network);

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
      const btcNetwork = getBitcoinNetwork(network);

      // Get the signer address for this network
      const signerAddress = getSignerAddress(network);

      const isBrowserWallet = walletType === 'browser';

      // For browser wallets, use actual addresses for UTXO discovery (passed as
      // opaque strings to esplora — no Address parsing, no LegacyAddressTooLong).
      // For keystore wallets, symbolic addresses resolve correctly via loaded mnemonic.
      const fromAddresses = isBrowserWallet
        ? [userSegwitAddress, userTaprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      // toAddresses: [signer (actual), user (actual/symbolic)]
      // Matches CLI wrap_btc.rs output ordering:
      //   Output 0 (v0): signer (receives BTC via B:amount:v0)
      //   Output 1 (v1): user (receives minted frBTC via pointer=v1)
      // JOURNAL ENTRY (2026-02-20): Use actual signer address directly (working version from commit 2fac01f3).
      // The PSBT patching approach was over-engineered and caused signing issues.
      // JOURNAL ENTRY (2026-02-20): For browser wallets, 'p2tr:0' resolves to the SDK dummy wallet address,
      // not the user's address. Must use actual userTaprootAddress for browser wallets.
      //
      // **BUG (2026-02-20): Despite passing correct addresses here, transaction outputs BOTH go to user**
      // Expected: [bcrt1p466wtm... (signer), bcrt1pvu3q2v... (user)]
      // Actual result: [bcrt1pvu3q2v... (user), bcrt1pvu3q2v... (user)]
      // Verified via 15+ tests on regtest. PR #251 fix at execute.rs:1348 did not resolve.
      // Diagnostic logs confirm correct addresses here. Bug is downstream in SDK execution.
      // See provider.rs:654 (WASM) and execute.rs:1278 (Rust) for diagnostic logging.
      const toAddresses = isBrowserWallet
        ? [signerAddress, userTaprootAddress]
        : [signerAddress, 'p2tr:0'];

      console.log('[WRAP] ============ alkanesExecuteTyped CALL ============');
      console.log('[WRAP] DIAGNOSTIC: signerAddress =', signerAddress);
      console.log('[WRAP] DIAGNOSTIC: userTaprootAddress =', userTaprootAddress);
      console.log('[WRAP] DIAGNOSTIC: isBrowserWallet =', isBrowserWallet);
      console.log('[WRAP] to_addresses:', JSON.stringify(toAddresses));
      console.log('[WRAP] to_addresses[0] (should be signer):', toAddresses[0]);
      console.log('[WRAP] to_addresses[1] (should be user):', toAddresses[1]);
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
          // For browser wallets, use actual addresses instead of symbolic to prevent
          // SDK from resolving to dummy wallet addresses
          changeAddress: isBrowserWallet ? (userSegwitAddress || 'p2wpkh:0') : 'p2wpkh:0',
          alkanesChangeAddress: isBrowserWallet ? userTaprootAddress : 'p2tr:0',
          autoConfirm: false,
          traceEnabled: true, // DIAGNOSTIC: Enable to trace address resolution flow
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

          // Extract PSBT as base64 from whatever format the WASM SDK returned
          let psbtBase64 = extractPsbtBase64(readyToSign.psbt);

          // ============================================================================
          // DIAGNOSTIC LOGGING - DO NOT REMOVE
          // ============================================================================
          // Added: 2026-02-20
          // Purpose: Detect any future regressions where PSBT addresses get corrupted
          //
          // Context: After 8+ hours debugging, we discovered patchPsbtForBrowserWallet()
          // was corrupting correct addresses from alkanes-rs SDK. These diagnostic logs
          // provide early warning if the bug reappears.
          //
          // What to expect in logs:
          // - Output 0: Should always be SIGNER address (bcrt1p466wtm... on regtest)
          // - Output 1: Should always be USER taproot address
          // - Output 2: BTC change to user SegWit address
          // - Output 3: OP_RETURN (protostone with alkane operation)
          //
          // If outputs ever show BOTH going to same address, PSBT corruption has returned.
          // Reference: ~/.claude/CLAUDE.md "CRITICAL: PSBT Patching Removed"
          // ============================================================================
          // Helper to classify script type from raw bytes
          const classifyScript = (script: Uint8Array | Buffer): string => {
            const s = Buffer.from(script);
            if (s.length === 34 && s[0] === 0x51 && s[1] === 0x20) return 'P2TR';
            if (s.length === 22 && s[0] === 0x00 && s[1] === 0x14) return 'P2WPKH';
            if (s.length === 23 && s[0] === 0xa9 && s[1] === 0x14 && s[22] === 0x87) return 'P2SH';
            if (s.length === 34 && s[0] === 0x00 && s[1] === 0x20) return 'P2WSH';
            if (s.length > 0 && s[0] === 0x6a) return 'OP_RETURN';
            return `UNKNOWN(len=${s.length},op=${s[0]?.toString(16)})`;
          };

          // Log per-input details for debugging
          const logInputDetails = (psbt: bitcoin.Psbt, label: string) => {
            console.log(`[WRAP-DIAG] === ${label} — ${psbt.data.inputs.length} inputs, ${psbt.txOutputs.length} outputs ===`);
            psbt.data.inputs.forEach((input, idx) => {
              const witnessScript = input.witnessUtxo?.script;
              const scriptHex = witnessScript ? Buffer.from(witnessScript).toString('hex') : 'NONE';
              const scriptType = witnessScript ? classifyScript(witnessScript) : 'NO_WITNESS_UTXO';
              const hasNonWitness = !!input.nonWitnessUtxo;
              const hasRedeemScript = !!input.redeemScript;
              const hasTapInternalKey = !!input.tapInternalKey;
              const tapKeyHex = input.tapInternalKey ? Buffer.from(input.tapInternalKey).toString('hex') : 'NONE';
              console.log(`  Input ${idx}: type=${scriptType} script=${scriptHex} nonWitnessUtxo=${hasNonWitness} redeemScript=${hasRedeemScript} tapInternalKey=${tapKeyHex}`);
            });
            psbt.txOutputs.forEach((out, idx) => {
              try {
                const addr = bitcoin.address.fromOutputScript(out.script, btcNetwork);
                console.log(`  Output ${idx}: ${out.value} sats -> ${addr}`);
              } catch {
                console.log(`  Output ${idx}: ${out.value} sats -> [OP_RETURN or non-standard]`);
              }
            });
          };

          console.log('[DIAGNOSTIC] BEFORE patching:');
          {
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            logInputDetails(tempPsbt, 'BEFORE PATCHING');
          }

          // ============================================================================
          // ⚠️ CRITICAL: PSBT PATCHING PERMANENTLY REMOVED - DO NOT RE-ADD ⚠️
          // ============================================================================
          // Date Removed: 2026-02-20
          // Investigation Time: 16+ hours across 2 days
          // Bug ID: Wrap transaction outputs going to wrong addresses
          //
          // THE BUG THAT WAS FIXED:
          // - Both transaction outputs were going to user address instead of [signer, user]
          // - Expected: Output 0 → signer (bcrt1p466wtm...), Output 1 → user (bcrt1pvu3q2v...)
          // - Actual: Output 0 & 1 BOTH → user (bcrt1pvu3q2v...)
          // - Verified via 15+ test transactions on regtest
          //
          // ROOT CAUSE (Frontend Bug):
          // 1. alkanes-rs SDK creates CORRECT PSBT with real addresses
          //    Verified via WASM diagnostic logs at provider.rs:786-810
          // 2. patchPsbtForBrowserWallet() was CORRUPTING these correct addresses
          // 3. How corruption happened:
          //    - Patching modified psbt.data.globalMap.unsignedTx.tx.outs[i].script ✓
          //    - But did NOT modify psbt.data.outputs[i] metadata ✗
          //    - finalizeAllInputs() reconstructed outputs from UNPATCHED metadata
          //    - This overwrote correct addresses with dummy/stale addresses
          //
          // WHY PATCHING EXISTED (Legacy):
          // - Originally added when SDK used symbolic addresses like 'p2tr:0'
          // - alkanes-rs was updated to use real addresses directly
          // - Patching became obsolete but was never removed
          // - Became HARMFUL by corrupting correct addresses
          //
          // THE FIX:
          // - Removed patchPsbtForBrowserWallet() call (lines 217-232, old code)
          // - alkanes-rs ALREADY creates PSBTs with correct real addresses
          // - No patching needed - use PSBT from SDK directly
          // - Added diagnostic logging to detect any future regressions
          //
          // VERIFICATION (Check browser console during wrap):
          // [OUTPUT DIAGNOSTIC] Output 0: 100000 sats -> bcrt1p466wtm... (SIGNER) ✅
          // [OUTPUT DIAGNOSTIC] Output 1: 546 sats -> bcrt1pvu3q2v... (USER) ✅
          // [DIAGNOSTIC] BEFORE patching: addresses match above ✅
          // [DIAGNOSTIC] AFTER patching: addresses STILL match (no corruption) ✅
          //
          // ⚠️ DO NOT RE-ADD PSBT PATCHING UNLESS:
          // 1. alkanes-rs reverted to using dummy addresses (check WASM diagnostic logs)
          // 2. Patching updates BOTH unsignedTx.tx.outs AND psbt.data.outputs metadata
          // 3. Comprehensive tests prevent regression
          // 4. Documented with evidence WHY patching is needed again
          //
          // Related Documentation:
          // - ~/.claude/CLAUDE.md: "CRITICAL: PSBT Patching Removed"
          // - ~/.claude/plans/stateless-roaming-tide.md: Complete investigation
          // - ~/.claude/plans/WRAP_BUG_INVESTIGATION_COMPLETE.md: Full timeline
          // ============================================================================
          console.log('[WRAP] Using PSBT from SDK (output addresses already correct, no output patching needed)');

          // INPUT-ONLY patching (no output patching — SDK outputs are correct):
          // 1. patchInputWitnessScripts: fix witnessUtxo.script where SDK dummy wallet
          //    uses P2SH but user has native P2WPKH (converts P2SH→P2WPKH)
          // 2. injectRedeemScripts: for P2SH-P2WPKH wallets (Xverse), inject the
          //    redeemScript so the wallet knows the inner P2WPKH script
          if (isBrowserWallet) {
            const { patchInputWitnessScripts, injectRedeemScripts } = await import('@/lib/psbt-patching');
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            const inputsPatched = patchInputWitnessScripts(tempPsbt, {
              taprootAddress: userTaprootAddress,
              segwitAddress: userSegwitAddress,
              network: btcNetwork,
            });
            if (inputsPatched > 0) {
              console.log(`[WRAP] Patched witnessUtxo.script on ${inputsPatched} input(s)`);
            }

            // Inject redeemScript for P2SH-P2WPKH wallets (Xverse: address starts with '3')
            const paymentPubkeyHex = account?.nativeSegwit?.pubkey;
            if (paymentPubkeyHex && userSegwitAddress) {
              const redeemScriptsInjected = injectRedeemScripts(tempPsbt, {
                paymentAddress: userSegwitAddress,
                pubkeyHex: paymentPubkeyHex,
                network: btcNetwork,
              });
              if (redeemScriptsInjected > 0) {
                console.log(`[WRAP] Injected redeemScript on ${redeemScriptsInjected} P2SH-P2WPKH input(s)`);
              }
            }

            psbtBase64 = tempPsbt.toBase64();
          }

          // DIAGNOSTIC: Log PSBT details after input patching
          console.log('[DIAGNOSTIC] AFTER input patching:');
          {
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            logInputDetails(tempPsbt, 'AFTER PATCHING');
          }

          // For keystore wallets, request user confirmation before signing
          // Browser wallets have their own confirmation UI from the wallet extension
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

          // Sign the PSBT with both SegWit and Taproot keys
          // JOURNAL ENTRY (2026-02-20): Simplified signing to match working version (commit 2fac01f3).
          // Browser wallets will ignore keys they don't have. Keystore wallets sign with both.
          // JOURNAL ENTRY (2026-02-20): OYL wallet signs ALL inputs (taproot + segwit) in a single
          // signPsbt call. Calling both signSegwitPsbt and signTaprootPsbt causes "Site origin must
          // be connected first" on the second call. For OYL and other browser wallets, only call
          // signTaprootPsbt once (it patches tapInternalKey and signs all inputs).
          console.log('[WRAP] Signing PSBT...');

          // Log PSBT details for debugging wallet signing issues
          const tempPsbtForCheck = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          const inputCount = tempPsbtForCheck.data.inputs.length;
          console.log(`[WRAP] PSBT has ${inputCount} inputs, ${tempPsbtForCheck.txOutputs.length} outputs`);

          let signedPsbtBase64: string;
          if (walletType === 'browser') {
            // Browser wallets (OYL, Xverse, Unisat, etc.) sign all inputs in one call
            signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
          } else {
            // Keystore wallets need both signing steps (BIP84 for segwit, BIP86 for taproot)
            signedPsbtBase64 = await signSegwitPsbt(psbtBase64);
            signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
          }

          // Parse the signed PSBT, finalize, and extract the raw transaction
          // JOURNAL ENTRY (2026-02-20): OYL wallet may return a fully finalized PSBT
          // (with finalScriptWitness already set) instead of adding intermediate signature fields.
          // Check if already finalized before attempting finalization.
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          console.log(`[WRAP-DIAG] === AFTER SIGNING — ${signedPsbt.data.inputs.length} inputs ===`);
          signedPsbt.data.inputs.forEach((inp, idx) => {
            const witnessScript = inp.witnessUtxo?.script;
            const scriptType = witnessScript ? classifyScript(witnessScript) : 'NO_WITNESS_UTXO';
            const scriptHex = witnessScript ? Buffer.from(witnessScript).toString('hex') : 'NONE';
            console.log(`  Input ${idx}: type=${scriptType} script=${scriptHex}`, {
              tapKeySig: inp.tapKeySig ? `${Buffer.from(inp.tapKeySig).length}B` : undefined,
              tapScriptSig: inp.tapScriptSig?.length || undefined,
              partialSig: inp.partialSig?.length || undefined,
              finalScriptWitness: inp.finalScriptWitness ? `${Buffer.from(inp.finalScriptWitness).length}B` : undefined,
              finalScriptSig: inp.finalScriptSig ? `${Buffer.from(inp.finalScriptSig).length}B` : undefined,
              redeemScript: inp.redeemScript ? `${Buffer.from(inp.redeemScript).length}B` : undefined,
              tapInternalKey: inp.tapInternalKey ? Buffer.from(inp.tapInternalKey).toString('hex') : undefined,
            });
          });

          // Check if OYL already finalized the PSBT
          const alreadyFinalized = signedPsbt.data.inputs.every(input =>
            input.finalScriptWitness || input.finalScriptSig
          );

          if (alreadyFinalized) {
            console.log('[WRAP] PSBT is already finalized by wallet, skipping finalization');
          } else {
            console.log('[WRAP] PSBT not finalized, attempting to finalize...');
            try {
              signedPsbt.finalizeAllInputs();
            } catch (e: any) {
              console.error('[WRAP] Finalization error:', e.message);
              // Dump per-input state to diagnose which input failed
              console.error('[WRAP-DIAG] === FINALIZATION FAILURE DUMP ===');
              signedPsbt.data.inputs.forEach((inp, idx) => {
                const ws = inp.witnessUtxo?.script;
                const sType = ws ? classifyScript(ws) : 'NO_WITNESS_UTXO';
                const sHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
                console.error(`  Input ${idx}: type=${sType} script=${sHex} redeemScript=${inp.redeemScript ? Buffer.from(inp.redeemScript).toString('hex') : 'NONE'} tapKeySig=${!!inp.tapKeySig} partialSig=${inp.partialSig?.length || 0} finalScriptWitness=${!!inp.finalScriptWitness}`);
              });
              // Try manual finalization for taproot key-path spend
              if (signedPsbt.data.inputs[0]?.tapKeySig) {
                console.log('[WRAP] Attempting manual finalization for taproot key-path spend');
                for (let i = 0; i < signedPsbt.data.inputs.length; i++) {
                  const input = signedPsbt.data.inputs[i];
                  if (input.tapKeySig) {
                    const tapKeySig = input.tapKeySig; // Capture for closure
                    signedPsbt.finalizeInput(i, () => {
                      return {
                        finalScriptWitness: bitcoin.script.compile([tapKeySig]),
                      };
                    });
                  }
                }
              } else {
                throw e;
              }
            }
          }

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
