/**
 * useWrapMutation — Wrap BTC into frBTC.
 *
 * Tx layout (must match CLI `wrap_btc.rs` ordering):
 *   - Output 0 (v0): Signer address — receives BTC via `inputRequirements = "B:<sats>:v0"`
 *   - Output 1 (v1): User taproot — receives minted frBTC via pointer=v1
 *   - protostone: `[32,0,77]:v1:v1` — fr-btc contract, opcode 77 (wrap)
 *
 * Signer address is the P2TR derived from the contract's GET_SIGNER (opcode 103).
 * Hardcoded per network in `lib/alkanes/constants.ts`. If the contract is
 * redeployed with a new signer key, that constant MUST be updated — wrong
 * address means BTC routes to nowhere and no frBTC is minted.
 *
 * Browser wallets need actual addresses for changeAddress/alkanesChangeAddress;
 * symbolic 'p2tr:0' / 'p2wpkh:0' resolve to the SDK's dummy wallet. Use the
 * `useActualAddresses` pattern. (See useSwapMutation header for the full
 * incident writeup, mainnet tx 985436b5...)
 *
 * WASM dependency: `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/`
 * (see next.config.mjs). On "Insufficient alkanes", sync per
 * docs/SDK_DEPENDENCY_MANAGEMENT.md.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { getBitcoinNetwork, getSignerAddress, getSignerAddressDynamic, extractPsbtBase64, getCleanPaymentUtxos } from '@/lib/alkanes/helpers';
import { buildWrapProtostone } from '@/lib/alkanes/builders';

bitcoin.initEccLib(ecc);

export type WrapTransactionBaseData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

export function useWrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, signSegwitPsbt, walletType, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (wrapData: WrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) throw new Error('Provider not available');

      // Check if WASM provider wallet is loaded for signing
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      const amountStr = String(wrapData.amount).replace(/,/g, '').trim();
      const wrapAmountSats = Math.floor(parseFloat(amountStr) * 100000000);
      if (isNaN(wrapAmountSats) || wrapAmountSats <= 0) {
        throw new Error(`Invalid wrap amount: "${wrapData.amount}" (parsed: ${wrapAmountSats})`);
      }
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

      // Get the signer address — on devnet, query dynamically since each boot
      // generates a new frBTC contract with a different signer key.
      // regtest-local and devnet have ephemeral signer keys — query the contract dynamically.
      // Other networks use the static SIGNER_ADDRESSES map.
      const signerAddress = (network === 'devnet' || network === 'regtest-local')
        ? await getSignerAddressDynamic(network)
        : getSignerAddress(network);

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';

      // For browser wallets, use actual addresses for UTXO discovery (passed as
      // opaque strings to esplora — no Address parsing, no LegacyAddressTooLong).
      // For keystore wallets, symbolic addresses resolve correctly via loaded mnemonic.
      const fromAddresses = useActualAddresses
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
      const toAddresses = useActualAddresses
        ? [signerAddress, userTaprootAddress]
        : [signerAddress, 'p2tr:0'];

      try {
        // Skip the WASM SDK's lua `spendable_utxos.lua` flow (slow on wallets
        // with many UTXOs because of per-UTXO `esplora_tx` coinbase-check
        // round-trips) by pre-fetching clean BTC UTXOs.
        // See `getCleanPaymentUtxos` for the fast UniSat / dataApi paths.
        //
        // Only safe when the addresses we fetch from match the addresses the
        // SDK will actually sign for. That's true when `useActualAddresses` is
        // true (browser wallet or devnet/regtest-local — addresses passed
        // verbatim) or for UniSat. For keystore on regtest/mainnet the SDK
        // resolves symbolic `p2tr:0`/`p2wpkh:0` against the WASM keystore
        // (coinType=1 on regtest); JS-derived (coinType=0) UTXOs would produce
        // an unsignable PSBT. Fall through to the SDK's lua path.
        const paymentUtxos = useActualAddresses || (isBrowserWallet && (window as any).unisat?.getBitcoinUtxos)
          ? await getCleanPaymentUtxos({
              provider,
              addresses: [userSegwitAddress, userTaprootAddress],
              unisat: isBrowserWallet ? (window as any).unisat : undefined,
            })
          : undefined;

        const result = await provider.alkanesExecuteTyped({
          toAddresses,
          inputRequirements,
          protostones: protostone,
          feeRate: wrapData.feeRate,
          fromAddresses,
          changeAddress: useActualAddresses ? (userSegwitAddress || userTaprootAddress) : 'p2wpkh:0',
          alkanesChangeAddress: useActualAddresses ? userTaprootAddress : 'p2tr:0',
          autoConfirm: false,
          traceEnabled: true,
          mineEnabled: false,
          ordinalsStrategy: 'exclude' as const,
          protectTaproot: Boolean(userSegwitAddress && userTaprootAddress),
          paymentUtxos,
        });

        // Check if execution completed (auto_confirm: true path)
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
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
          // INPUT-ONLY patching (no output patching — SDK outputs are correct):
          // 1. patchInputWitnessScripts: fix witnessUtxo.script where SDK dummy wallet
          //    uses P2SH but user has native P2WPKH (converts P2SH→P2WPKH)
          // 2. injectRedeemScripts: for P2SH-P2WPKH wallets (Xverse), inject the
          //    redeemScript so the wallet knows the inner P2WPKH script
          if (isBrowserWallet) {
            const { patchInputWitnessScripts, injectRedeemScripts } = await import('@/lib/psbt-patching');
            const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
            patchInputWitnessScripts(tempPsbt, {
              taprootAddress: userTaprootAddress,
              segwitAddress: userSegwitAddress,
              network: btcNetwork,
            });
            // Inject redeemScript for P2SH-P2WPKH wallets (Xverse: address starts with '3')
            const paymentPubkeyHex = account?.nativeSegwit?.pubkey;
            if (paymentPubkeyHex && userSegwitAddress) {
              injectRedeemScripts(tempPsbt, {
                paymentAddress: userSegwitAddress,
                pubkeyHex: paymentPubkeyHex,
                network: btcNetwork,
              });
            }

            psbtBase64 = tempPsbt.toBase64();
          }

          // For keystore wallets, request user confirmation before signing
          // Browser wallets have their own confirmation UI from the wallet extension
          if (walletType === 'keystore') {
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
              throw new Error('Transaction rejected by user');
            }
          }

          // Sign the PSBT with both SegWit and Taproot keys
          // JOURNAL ENTRY (2026-02-20): Simplified signing to match working version (commit 2fac01f3).
          // Browser wallets will ignore keys they don't have. Keystore wallets sign with both.
          // JOURNAL ENTRY (2026-02-20): OYL wallet signs ALL inputs (taproot + segwit) in a single
          // signPsbt call. Calling both signSegwitPsbt and signTaprootPsbt causes "Site origin must
          // be connected first" on the second call. For OYL and other browser wallets, only call
          // signTaprootPsbt once (it patches tapInternalKey and signs all inputs).
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

          // Check if OYL already finalized the PSBT
          const alreadyFinalized = signedPsbt.data.inputs.every(input =>
            input.finalScriptWitness || input.finalScriptSig
          );

          if (!alreadyFinalized) {
            try {
              signedPsbt.finalizeAllInputs();
            } catch (e: any) {
              console.error('[WRAP] Finalization error:', e.message);
              // Dump per-input state to diagnose which input failed
              console.error('[WRAP-DIAG] === FINALIZATION FAILURE DUMP ===');
              signedPsbt.data.inputs.forEach((inp, idx) => {
                const ws = inp.witnessUtxo?.script;
                const sHex = ws ? Buffer.from(ws).toString('hex') : 'NONE';
                console.error(`  Input ${idx}: script=${sHex} redeemScript=${inp.redeemScript ? Buffer.from(inp.redeemScript).toString('hex') : 'NONE'} tapKeySig=${!!inp.tapKeySig} partialSig=${inp.partialSig?.length || 0} finalScriptWitness=${!!inp.finalScriptWitness}`);
              });
              // Try manual finalization for taproot key-path spend
              if (signedPsbt.data.inputs[0]?.tapKeySig) {
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

          // Broadcast the transaction
          const broadcastTxid = await provider.broadcastTransaction(txHex);

          return {
            success: true,
            transactionId: broadcastTxid || txid,
            wrapAmountSats,
            txHex,
          } as { success: boolean; transactionId?: string; wrapAmountSats?: number; txHex?: string };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;

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
    onSuccess: () => {
      // ⚠️ (2026-03-26): MUST use refetchQueries, not invalidateQueries.
      // invalidateQueries marks as stale but won't re-execute queryFn if
      // data is within staleTime (30s on non-devnet). refetchQueries forces
      // immediate execution. The 'alkane-balances' key was also missing
      // from the original list — without it, frBTC never showed after wrap.
      queryClient.refetchQueries({ queryKey: ['alkane-balances'] });
      queryClient.refetchQueries({ queryKey: ['sellable-currencies'] });
      queryClient.refetchQueries({ queryKey: ['btc-balance'] });
      queryClient.refetchQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
    },
  });
}
