/**
 * useUnwrapMutation — Unwrap frBTC back to BTC.
 *
 * Browser wallets MUST receive actual addresses (not 'p2tr:0' / 'p2wpkh:0')
 * via the `useActualAddresses` pattern; symbolic addresses resolve to the
 * SDK's dummy wallet and lose user funds. See `useSwapMutation` for the
 * full incident writeup (mainnet tx 985436b5c5c8...).
 *
 * Networks where the deployed fr-btc `[32:0]` doesn't support opcode 78
 * are gated by `lib/alkanes/contractFeatures.ts` — UI should hide the
 * Unwrap path there, and this hook throws a defense-in-depth error if a
 * callsite slips through.
 *
 * WASM dependency: `@alkanes/ts-sdk/wasm` aliased to `lib/oyl/alkanes/`
 * (see next.config.mjs). On "Insufficient alkanes" errors, sync the WASM
 * per docs/SDK_DEPENDENCY_MANAGEMENT.md.
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
import { getFrBtcFeatures } from '@/lib/alkanes/contractFeatures';

bitcoin.initEccLib(ecc);

export type UnwrapTransactionBaseData = {
  amount: string; // display units (frBTC)
  feeRate: number; // sats/vB
};

export function useUnwrapMutation() {
  const { account, network, isConnected, signSegwitPsbt, signTaprootPsbt, walletType, browserWallet } = useWallet();
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
      // For alkane operations, prefer taproot if available (alkanes use P2TR)
      const primaryAddress = taprootAddress || segwitAddress;
      // Verify wallet is loaded in provider
      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      // Refuse to broadcast if the deployed fr-btc contract on this network
      // doesn't implement opcode 78 yet. The capability matrix in
      // lib/alkanes/contractFeatures.ts is the source of truth; flip the
      // flag there when the contract is upgraded. The Unwrap UI should
      // already be hidden on networks where this is false — this throw is
      // a defense-in-depth check for any callsite that bypasses the gate.
      if (!getFrBtcFeatures(network).unwrap) {
        throw new Error(
          'Unwrap is not yet supported by the deployed frBTC contract on this network. ' +
          'Your frBTC is safe — please use Swap to convert frBTC → BTC instead.',
        );
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
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest' || network === 'regtest';

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
          // inputsPatched count available in result.inputsPatched if needed
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
