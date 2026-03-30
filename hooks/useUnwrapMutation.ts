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
import { getBitcoinNetwork, extractPsbtBase64, toAlks } from '@/lib/alkanes/helpers';

bitcoin.initEccLib(ecc);

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

export function useUnwrapMutation() {
  const { account, network, isConnected, signSegwitPsbt, signTaprootPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  const { FRBTC_ALKANE_ID } = getConfig(network);

  return useMutation({
    mutationFn: async (unwrapData: UnwrapTransactionBaseData) => {
      if (!isConnected) throw new Error('Wallet not connected');
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
      // For alkane operations, prefer taproot if available (alkanes use P2TR)
      const primaryAddress = taprootAddress || segwitAddress;

      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      const unwrapAmount = toAlks(unwrapData.amount);

      // Build protostone for unwrap operation
      const protostone = buildUnwrapProtostone({
        frbtcId: FRBTC_ALKANE_ID,
      });

      // Input requirements: frBTC amount to unwrap
      const inputRequirements = buildUnwrapInputRequirements({
        frbtcId: FRBTC_ALKANE_ID,
        amount: unwrapAmount,
      });

      // Get recipient address (taproot for alkanes, but BTC goes to segwit)
      const recipientAddress = account?.nativeSegwit?.address || account?.taproot?.address;
      if (!recipientAddress) throw new Error('No recipient address available');

      // Determine btcNetwork for PSBT operations
      const btcNetwork = getBitcoinNetwork(network);


      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet';

      // ============================================================================
      // ⚠️ CRITICAL: Browser wallets need ACTUAL addresses, not symbolic ⚠️
      // ============================================================================
      // Symbolic addresses (p2tr:0, p2wpkh:0) resolve to the SDK's DUMMY wallet.
      // Bug fixed: 2026-03-01 - see useSwapMutation.ts for full documentation.
      // ============================================================================
      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      // Unwrap outputs BTC to segwit address (or taproot if no segwit)
      // TypeScript can't infer from the early return that at least one address exists
      const toAddresses = useActualAddresses
        ? [(segwitAddress || taprootAddress)!]
        : ['p2wpkh:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      // JOURNAL ENTRY (2026-03-01): For single-address wallets, use primaryAddress
      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';


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



      // Handle auto-completed transaction
      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        return { success: true, transactionId: txId };
      }

      // Handle readyToSign state (need to sign PSBT manually)
      if (result?.readyToSign) {
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
          }
        }

        // For keystore wallets, request user confirmation before signing
        if (walletType === 'keystore') {
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
            throw new Error('Transaction rejected by user');
          }
        }

        // Sign PSBT — browser wallets sign all input types in a single call,
        // so we must NOT call signPsbt twice (causes "inputType: sh without redeemScript").
        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);
        } else {
          signedPsbtBase64 = await signSegwitPsbt(finalPsbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        // Finalize and extract transaction
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        signedPsbt.finalizeAllInputs();

        const tx = signedPsbt.extractTransaction();
        const txHex = tx.toHex();
        const txid = tx.getId();


        // Broadcast
        const broadcastTxid = await provider.broadcastTransaction(txHex);

        return {
          success: true,
          transactionId: broadcastTxid || txid,
        };
      }

      // Handle complete state
      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true, transactionId: txId };
      }

      // Fallback
      const txId = result?.txid || result?.reveal_txid;
      return { success: true, transactionId: txId };
    },
    onSuccess: (data) => {

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

    },
  });
}
