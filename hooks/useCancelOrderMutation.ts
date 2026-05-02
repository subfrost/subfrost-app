/**
 * useCancelOrderMutation.ts
 *
 * Cancels an open limit order on the Carbine order book.
 *
 * Contract: Carbine controller (e.g. 4:70000).
 * Opcode 21 (CancelOrder): Simple cellpack with order_id. No tokens sent.
 *
 * ============================================================================
 * CRITICAL: BROWSER WALLET OUTPUT ADDRESS BUG (2026-03-01)
 * ============================================================================
 * When using browser wallets, you MUST pass ACTUAL addresses to
 * toAddresses/changeAddress/alkanesChangeAddress -- NOT symbolic addresses like
 * 'p2tr:0' or 'p2wpkh:0'. Symbolic addresses resolve to SDK's DUMMY wallet!
 * See useSwapMutation.ts header comment for full documentation.
 * ============================================================================
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export interface CancelOrderParams {
  controllerId: string; // Carbine controller alkane ID e.g. "4:70000"
  orderId: number;      // Order ID to cancel
  feeRate: number;
}

export function useCancelOrderMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, browserWallet, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CancelOrderParams) => {
      console.log('[CancelOrder] ═══════════════════════════════════════════');
      console.log('[CancelOrder] Starting CancelOrder transaction');
      console.log('[CancelOrder] Params:', JSON.stringify(params, null, 2));

      // Validation
      if (!isConnected) throw new Error('Wallet not connected');
      // Ensure browser wallet session is active before building PSBT
      if (walletType === 'browser') {
        const { ensureWalletSession } = await import('@/lib/wallet/browserWalletSigning');
        await ensureWalletSession();
      }
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) {
        throw new Error('No wallet address available. Please connect a wallet first.');
      }
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      const primaryAddress = (taprootAddress || segwitAddress)!;
      console.log('[CancelOrder] Using addresses:', { taprootAddress, segwitAddress, primaryAddress });

      // Parse controller ID
      const [cBlock, cTx] = params.controllerId.split(':');

      // Build protostone: CancelOrder opcode 21 with orderId
      // No inputRequirements needed -- no tokens are sent for cancellation
      const protostone = `[${cBlock},${cTx},21,${params.orderId}]:v0:v0`;

      // No input requirements for cancel -- no tokens sent
      const inputRequirements = '';

      console.log('[CancelOrder] Protostone:', protostone);
      console.log('[CancelOrder] Input requirements: (none)');

      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';

      const toAddresses = [primaryAddress];

      console.log('[CancelOrder] From addresses:', txContext.feeSourceAddresses, '(browser:', isBrowserWallet, ')');
      console.log('[CancelOrder] To addresses:', toAddresses);

      try {

        const result = await provider.alkanesExecuteTyped({
          txContext,
          inputRequirements,
          protostones: protostone,
          feeRate: params.feeRate,
          autoConfirm: false,
          toAddresses,
        });

        console.log('[CancelOrder] Execute result:', JSON.stringify(result, null, 2));

        // Handle auto-completed transaction
        if (result?.txid || result?.reveal_txid) {
          const txId = result.txid || result.reveal_txid;
          console.log('[CancelOrder] Transaction auto-completed, txid:', txId);
          return { success: true as const, transactionId: txId };
        }

        // Handle readyToSign state (need to sign PSBT manually)
        if (result?.readyToSign) {
          console.log('[CancelOrder] Got readyToSign, signing PSBT...');
          const readyToSign = result.readyToSign;

          let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

          // Input patching for browser wallets
          if (isBrowserWallet) {
            const patchResult = patchInputsOnly({
              psbtBase64,
              network: btcNetwork,
              taprootAddress: taprootAddress!,
              segwitAddress,
              paymentPubkeyHex: account?.nativeSegwit?.pubkey,
            });
            psbtBase64 = patchResult.psbtBase64;
            if (patchResult.inputsPatched > 0) {
              console.log(`[CancelOrder] Patched ${patchResult.inputsPatched} input(s) for browser wallet compatibility`);
            }
          }

          // Single signing path. Browser wallets sign all input types via the wallet
          // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
          console.log('[CancelOrder] Signing PSBT...');
          const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

          // Finalize and extract transaction
          const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
          signedPsbt.finalizeAllInputs();

          const tx = signedPsbt.extractTransaction();
          const txHex = tx.toHex();
          const txid = tx.getId();

          console.log('[CancelOrder] Transaction built:', txid);

          // Broadcast
          const broadcastTxid = await provider.broadcastTransaction(txHex);
          console.log('[CancelOrder] Broadcast successful:', broadcastTxid);

          return {
            success: true as const,
            transactionId: broadcastTxid || txid,
          };
        }

        // Handle complete state
        if (result?.complete) {
          const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
          console.log('[CancelOrder] Complete, txid:', txId);
          return { success: true as const, transactionId: txId };
        }

        // Fallback
        const txId = result?.txid || result?.reveal_txid;
        console.log('[CancelOrder] Transaction ID:', txId);
        return { success: true as const, transactionId: txId };

      } catch (error) {
        console.error('[CancelOrder] Execution error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('[CancelOrder] Success! txid:', data.transactionId);

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
      queryClient.invalidateQueries({ queryKey: ['user-orders'] });
    },
  });
}
