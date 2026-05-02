/**
 * useUnwrapEthMutation - Unwrap frETH back to BTC
 *
 * Mirrors useUnwrapMutation but targets frETH [42:0] instead of frBTC [32:0].
 *
 * Burns frETH tokens and queues a ETH payment via FROST threshold ECDSA.
 * The payment is fulfilled asynchronously by the FROST signing group.
 *
 * Key differences from frBTC unwrap:
 * - AlkaneId [42:0] (FROST) vs [32:0] (FROST)
 * - Payment goes to a Zcash t-address (P2PKH), not a Bitcoin P2TR address
 * - Signing uses FROST (ECDSA) instead of FROST (Schnorr)
 *
 * ⚠️ BROWSER WALLET: Must use ACTUAL addresses, not symbolic ('p2tr:0').
 * See useSwapMutation.ts header for full documentation of this critical bug.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { buildUnwrapEthProtostone, buildUnwrapEthInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, extractPsbtBase64, toAlks } from '@/lib/alkanes/helpers';
import { getConfig } from '@/utils/getConfig';

bitcoin.initEccLib(ecc);

export type UnwrapEthTransactionData = {
  amount: string; // display units (frETH)
  feeRate: number; // sats/vB
};

export function useUnwrapEthMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();

  // frETH AlkaneId — deployed contract [4:n], from network config
  const FRETH_ALKANE_ID = (getConfig(network) as any).FRETH_ALKANE_ID as string;

  return useMutation({
    mutationFn: async (unwrapData: UnwrapEthTransactionData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) throw new Error('No wallet address available');
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;

      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      const unwrapAmount = toAlks(unwrapData.amount);
      const protostone = buildUnwrapEthProtostone({ frethId: FRETH_ALKANE_ID });
      const inputRequirements = buildUnwrapEthInputRequirements({
        frethId: FRETH_ALKANE_ID,
        amount: unwrapAmount,
      });

      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';

      // Unwrap deposits BTC to the BTC change address (segwit when available).
      const toAddresses = [txContext.btcChangeAddress];

      console.log('[UNWRAP-ETH] amount:', unwrapAmount, 'from:', txContext.feeSourceAddresses);

      const result = await provider.alkanesExecuteTyped({
        txContext,
        toAddresses,
        inputRequirements,
        protostones: protostone,
        feeRate: unwrapData.feeRate,
        autoConfirm: false,
      });

      if (result?.txid || result?.reveal_txid) {
        const txId = result.txid || result.reveal_txid;
        return { success: true, transactionId: txId };
      }

      if (result?.readyToSign) {
        let psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        let finalPsbtBase64 = psbtBase64;
        if (isBrowserWallet) {
          const patchResult = patchInputsOnly({
            psbtBase64,
            network: btcNetwork,
            taprootAddress: taprootAddress!,
            segwitAddress,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
          });
          finalPsbtBase64 = patchResult.psbtBase64;
        }

        if (walletType === 'keystore') {
          const approved = await requestConfirmation({
            type: 'unwrap',
            title: 'Confirm Unwrap frETH',
            fromAmount: unwrapData.amount,
            fromSymbol: 'frETH',
            toAmount: unwrapData.amount,
            toSymbol: 'BTC',
            feeRate: unwrapData.feeRate,
          });
          if (!approved) throw new Error('Transaction rejected by user');
        }

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);

        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        const alreadyFinalized = signedPsbt.data.inputs.every(input =>
          input.finalScriptWitness || input.finalScriptSig
        );
        if (!alreadyFinalized) {
          signedPsbt.finalizeAllInputs();
        }

        const tx = signedPsbt.extractTransaction();
        const broadcastTxid = await provider.broadcastTransaction(tx.toHex());
        console.log('[UNWRAP-ETH] Broadcast:', broadcastTxid || tx.getId());

        return { success: true, transactionId: broadcastTxid || tx.getId() };
      }

      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true, transactionId: txId };
      }

      return { success: true, transactionId: result?.txid || result?.reveal_txid };
    },
    onSuccess: () => {
      console.log('[UNWRAP-ETH] Success, refetching balances');
      queryClient.refetchQueries({ queryKey: ['alkane-balances'] });
      queryClient.refetchQueries({ queryKey: ['sellable-currencies'] });
      queryClient.refetchQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
    },
  });
}
