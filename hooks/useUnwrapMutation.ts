/**
 * useUnwrapMutation - Unwrap frBTC back to BTC
 *
 * ============================================================================
 * ⚠️⚠️⚠️ CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01) ⚠️⚠️⚠️
 * ============================================================================
 *
 * When using browser wallets (Xverse, OYL, etc.), you MUST pass ACTUAL addresses
 * to toAddresses/changeAddress/alkanesChangeAddress — NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 *
 * See useSwapMutation.ts header comment for full documentation of this bug,
 * including the transaction that lost user tokens:
 * TX: 985436b5c5c850bd121cd4862f32413f467145b121d34c006417724d71588db9
 *
 * REQUIRED PATTERN:
 * ```typescript
 * const toAddresses = useActualAddresses ? [segwitAddress] : ['p2wpkh:0'];
 * const changeAddr = useActualAddresses ? segwitAddress : 'p2wpkh:0';
 * const alkanesChangeAddr = useActualAddresses ? taprootAddress : 'p2tr:0';
 * ```
 * ============================================================================
 *
 * ## WASM Dependency Note
 *
 * Uses `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/` (see next.config.mjs).
 * If "Insufficient alkanes" errors occur, sync WASM: see docs/SDK_DEPENDENCY_MANAGEMENT.md
 *
 * ## frBTC Unwrap (opcode 78) — network-dependent (2026-03-26)
 *
 * Opcode 78 WORKS on devnet (fresh deploy from prod_wasms/fr_btc.wasm).
 * Opcode 78 does NOT work on regtest.subfrost.io — the deployed frBTC [32:0]
 * there is an older build missing this opcode. The regtest contract returns:
 *   "ALKANES: revert: Error: Unrecognized opcode" (status: 1)
 * The tier1/unwrap-frbtc.test.ts skip comment applies to REGTEST only.
 *
 * ## Calldata Bug Fix (2026-04-29) — `Cannot burn less than dust amount`
 *
 * Pre-fix this hook built `buildUnwrapProtostone({ frbtcId })` which produced
 * the cellpack `[32, 0, 78]` with NO arguments. The contract's signature is
 * `unwrap(vout: u128, amount_requested: u128)` (see `fr-btc/contract.wit` and
 * `fr-btc/alkanes.toml`). With the args missing, runtime read `vout = 0`,
 * `amount_requested = 0`, then `min(0, frbtc_sent) = 0` triggered the
 * `actual_amount_burn < 546` branch in `fr-btc/src/lib.rs:531-532` →
 * "Cannot burn less than dust amount" (espo renders this as "dust limit
 * underflow"). All incoming frBTC was refunded via the `Refund` pointer, so
 * tokens were never destroyed — the unwrap simply never settled.
 *
 * Real-world repro: tx
 *   `a95597ad69209615a519929b0cc2fb7bddbadd4bce302ec200a838302bfb7eef`
 * confirmed at block 947162 with the malformed cellpack; the user's frBTC
 * bounced to vout 1 (verified via `alkanes_protorunesbyoutpoint`).
 *
 * Fix: the cellpack must be `[32, 0, 78, dustVout, amount]` AND the tx must
 * include a P2TR signer dust output at index `dustVout` (the contract's
 * `burn()` enforces `tx.output[dustVout].script_pubkey == signer_script` —
 * see `fr-btc/src/lib.rs:262-267`). The signer later spends that dust UTXO
 * to settle the BTC payment recorded under `/payments/byheight/`.
 *
 * Output layout (matches `alkanes-cli/src/main.rs:3192-3197`):
 *   - output 0: alkanes refund (taproot)         ← refund=v0
 *   - output 1: BTC recipient (segwit)           ← pointer=v1
 *   - output 2: signer P2TR dust                 ← dustVout=2
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
// NOTE: Only patching INPUTS (witnessUtxo + redeemScript), NOT outputs
// Output patching was removed - see useSwapMutation.ts for why
import { patchInputsOnly } from '@/lib/psbt-patching';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { buildUnwrapProtostone, buildUnwrapInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, extractPsbtBase64, toAlks, getSignerAddressDynamic } from '@/lib/alkanes/helpers';

bitcoin.initEccLib(ecc);

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

export function useUnwrapMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (unwrapData: UnwrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) throw new Error('Provider not available');

      // Get addresses - use actual addresses instead of SDK descriptors
      // This fixes the "Available: []" issue where SDK couldn't find alkane UTXOs
      //
      // JOURNAL ENTRY (2026-03-01): Support single-address wallets (UniSat, OKX)
      // UniSat/OKX only provide one address type at a time (user-configurable).
      // We need at least ONE address, but don't require both taproot AND segwit.
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      // For alkane operations, prefer taproot if available (alkanes use P2TR).
      // The early `throw` above guarantees at least one address; non-null
      // assertion is applied at call sites that need a `string` (toAddresses).
      const primaryAddress = taprootAddress || segwitAddress;
      console.log('[useUnwrapMutation] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      const unwrapAmount = toAlks(unwrapData.amount);

      // Input requirements: frBTC amount to unwrap (SDK auto-edicts to p0)
      const inputRequirements = buildUnwrapInputRequirements({
        frbtcId: FRBTC_ALKANE_ID,
        amount: unwrapAmount,
      });

      // BTC recipient. Default to segwit (cheaper); fall back to taproot for
      // single-address wallets that don't expose a segwit derivation.
      const recipientAddress = account?.nativeSegwit?.address || account?.taproot?.address;
      if (!recipientAddress) throw new Error('No recipient address available');

      // Determine btcNetwork for PSBT operations
      const btcNetwork = getBitcoinNetwork(network);

      // ----------------------------------------------------------------------
      // Resolve the FROST signer's tweaked P2TR address (the dust output).
      // ----------------------------------------------------------------------
      // The contract's `burn()` requires `tx.output[dustVout].script_pubkey ==
      // signer_script` — i.e. one of our outputs MUST be this exact P2TR
      // script (see fr-btc/src/lib.rs:262-267).
      //
      // ALWAYS query dynamically. Opcode 103 returns the internal x-only
      // pubkey; `getSignerAddressDynamic` derives the BIP341-tweaked P2TR via
      // bitcoinjs `payments.p2tr`, which is exactly what the on-chain
      // signer_script encodes. The hardcoded `SIGNER_ADDRESSES.mainnet` was
      // historically the UNTWEAKED address (bc1p09qw7w...) — using it sends
      // dust to the wrong script and the contract reverts with
      // "signer pubkey must be targeted with supplementary output".
      // Mirrors the perf-branch fix `b3b3a1bf` ("frBTC wrap signer address —
      // apply BIP341 taproot tweak") for the wrap path.
      const signerAddress = await getSignerAddressDynamic(network);

      console.log('[useUnwrapMutation] Executing unwrap:', {
        amount: unwrapAmount,
        frbtcId: FRBTC_ALKANE_ID,
        recipient: recipientAddress,
        signer: signerAddress,
        feeRate: unwrapData.feeRate,
      });

      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest';

      // ============================================================================
      // ⚠️ CRITICAL: Browser wallets need ACTUAL addresses, not symbolic ⚠️
      // ============================================================================
      // Symbolic addresses (p2tr:0, p2wpkh:0) resolve to the SDK's DUMMY wallet.
      // Bug fixed: 2026-03-01 - see useSwapMutation.ts for full documentation.
      // ============================================================================
      // Keystore is taproot-only: symbolic addresses all resolve to p2tr:0.
      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2tr:0'];

      // ----------------------------------------------------------------------
      // Three-output unwrap layout (CLI canonical):
      //   v0: alkanes refund (taproot or primary)   ← refund=v0
      //   v1: BTC recipient (segwit or fallback)    ← pointer=v1
      //   v2: FROST signer P2TR dust                ← dustVout=2
      //
      // Browser wallets must receive ACTUAL addresses (not symbolic) — same
      // bug class as 2026-03-01. Keystore takes the symbolic descriptor
      // branch which the SDK resolves against its loaded mnemonic; BTC
      // recipient v1 is taproot for keystore (taproot-only policy).
      // ----------------------------------------------------------------------
      const DUST_VOUT = 2;
      const toAddresses = useActualAddresses
        ? [primaryAddress!, (segwitAddress || taprootAddress)!, signerAddress]
        : ['p2tr:0', 'p2tr:0', signerAddress];

      // Build protostone for unwrap operation. MUST include dustVout + amount
      // in the cellpack — see header comment ("Calldata Bug Fix 2026-04-29").
      const protostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
        dustVout: DUST_VOUT,
        amount: unwrapAmount,
        pointer: 'v1', // BTC payment record points at btcRecipient
        refund: 'v0',  // unspent frBTC bounces back to alkanes recipient
      });

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2tr:0';

      // JOURNAL ENTRY (2026-03-01): For single-address wallets, use primaryAddress
      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';

      console.log('[useUnwrapMutation] From addresses:', fromAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[useUnwrapMutation] To addresses (v0=alkanes-refund, v1=btc-recipient, v2=signer-dust):', toAddresses);
      console.log('[useUnwrapMutation] Change address:', changeAddr);


      const result = await provider.alkanesExecuteTyped({
        toAddresses,
        inputRequirements,
        protostones: protostone,
        feeRate: unwrapData.feeRate,
        autoConfirm: false,
        fromAddresses,
        changeAddress: changeAddr,
        alkanesChangeAddress: alkanesChangeAddr,
      });

      console.log('[useUnwrapMutation] Called alkanesExecuteTyped (browser:', isBrowserWallet, ')');

      console.log('[useUnwrapMutation] Execute result:', JSON.stringify(result, null, 2));

      // Handle auto-completed transaction
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        console.log('[useUnwrapMutation] Transaction auto-completed, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Handle readyToSign state (need to sign PSBT manually)
      if (result?.readyToSign) {
        console.log('[useUnwrapMutation] Got readyToSign, signing PSBT...');
        const readyToSign = result.readyToSign;

        // Convert PSBT to base64
        let psbtBase64 = extractPsbtBase64(readyToSign.psbt);

        // ============================================================================
        // ⚠️ CRITICAL: PSBT PATCHING REMOVED - DO NOT RE-ADD ⚠️
        // ============================================================================
        // Date Removed: 2026-03-01 (same as useSwapMutation.ts fix)
        // See useSwapMutation.ts:444-483 for full documentation.
        //
        // alkanes-rs SDK creates PSBTs with correct real addresses for browser wallets.
        // patchPsbtForBrowserWallet was CORRUPTING these addresses.
        // ============================================================================

        console.log('[useUnwrapMutation] Using PSBT from SDK (addresses already correct, no patching needed)');

        // ============================================================================
        // Input patching for ALL browser wallet types
        // ============================================================================
        // Different wallets have different requirements:
        // - Xverse: P2SH-P2WPKH (starts with '3'/'2'). Needs redeemScript injection.
        // - UniSat/OKX: Single-address P2TR or P2WPKH. Need witnessUtxo.script patching.
        // - OYL/Leather/Phantom: Native P2WPKH (bc1q). Need witnessUtxo.script patching.
        //
        // patchInputsOnly handles ALL these cases. It does NOT touch outputs (the SDK
        // already creates correct output addresses when we pass actual addresses).
        // ============================================================================
        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const result = patchInputsOnly({
            psbtBase64,
            network: btcNetwork,
            taprootAddress: taprootAddress!,
            segwitAddress,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
          });
          finalPsbtBase64 = result.psbtBase64;
          if (result.inputsPatched > 0) {
            console.log(`[useUnwrapMutation] Patched ${result.inputsPatched} input(s) for browser wallet compatibility`);
          }
        }

        // For keystore wallets, request user confirmation before signing
        if (walletType === 'keystore') {
          console.log('[useUnwrapMutation] Keystore wallet - requesting user confirmation...');
          const approved = await requestConfirmation({
            type: 'unwrap',
            title: 'Confirm Unwrap',
            fromAmount: unwrapData.amount,
            fromSymbol: 'frBTC',
            toAmount: unwrapData.amount,
            toSymbol: 'BTC',
            feeRate: unwrapData.feeRate,
          });

          if (!approved) {
            console.log('[useUnwrapMutation] User rejected transaction');
            throw new Error('Transaction rejected by user');
          }
          console.log('[useUnwrapMutation] User approved transaction');
        }

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

        // Finalize and extract transaction. Some wallets (UniSat with
        // autoFinalized: true) return PSBTs that are already finalized —
        // calling finalizeAllInputs() on those is at best wasteful and at
        // worst throws because there's nothing left to finalize. Match the
        // pattern used by useSwapMutation / useWrapMutation: only finalize
        // if no input has finalScriptWitness or finalScriptSig set.
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        const alreadyFinalized = signedPsbt.data.inputs.every(
          input => input.finalScriptWitness || input.finalScriptSig,
        );
        if (alreadyFinalized) {
          console.log('[useUnwrapMutation] PSBT already finalized by wallet, skipping finalizeAllInputs');
        } else {
          signedPsbt.finalizeAllInputs();
        }

        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();

        console.log('[useUnwrapMutation] Transaction built:', txid);

        // Broadcast
        const broadcastTxid = await provider.broadcastTransaction(txHex);
        console.log('[useUnwrapMutation] Broadcast successful:', broadcastTxid);

        return {
          success: true,
          transactionId: broadcastTxid || txid,
        };
      }

      // Handle complete state
      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        console.log('[useUnwrapMutation] Complete, txid:', txId);
        return { success: true, transactionId: txId };
      }

      // Fallback
      const txId = result?.txid || result?.reveal_txid;
      console.log('[useUnwrapMutation] Transaction ID:', txId);
      return { success: true, transactionId: txId };
    },
    onSuccess: (data) => {
      console.log('[useUnwrapMutation] Unwrap successful, invalidating balance queries...');

      // Invalidate all balance-related queries to refresh UI immediately
      const walletAddress = account?.taproot?.address;

      // Invalidate sellable currencies (shows frBTC balance in swap UI)
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });

      // Invalidate BTC balance queries
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });

      // Invalidate frBTC premium data
      queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });

      // Invalidate pool-related queries
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['poolFee'] });
      // Invalidate activity feed so it shows the new unwrap transaction
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });

      console.log('[useUnwrapMutation] Balance queries invalidated for address:', walletAddress);
    },
  });
}
