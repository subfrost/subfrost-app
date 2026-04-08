/**
 * useUnwrapZecMutation - Unwrap frZEC back to BTC
 *
 * Mirrors useUnwrapMutation but targets frZEC [42:0] instead of frBTC [32:0].
 *
 * Burns frZEC tokens and queues a ZEC payment via CGGMP21 threshold ECDSA.
 * The payment is fulfilled asynchronously by the CGGMP21 signing group.
 *
 * Key differences from frBTC unwrap:
 * - AlkaneId [42:0] (CGGMP21) vs [32:0] (FROST)
 * - Payment goes to a Zcash t-address (P2PKH), not a Bitcoin P2TR address
 * - Signing uses CGGMP21 (ECDSA) instead of FROST (Schnorr)
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
import { buildUnwrapZecProtostone, buildUnwrapZecInputRequirements } from '@/lib/alkanes/builders';
import { getBitcoinNetwork, extractPsbtBase64, toAlks } from '@/lib/alkanes/helpers';
import { getConfig } from '@/utils/getConfig';

bitcoin.initEccLib(ecc);

export type UnwrapZecTransactionData = {
  amount: string; // display units (frZEC)
  feeRate: number; // sats/vB
};

export function useUnwrapZecMutation() {
  const { account, network, isConnected, signSegwitPsbt, signTaprootPsbt, walletType } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();

  // frZEC AlkaneId — deployed contract [4:n], from network config
  const FRZEC_ALKANE_ID = (getConfig(network) as any).FRZEC_ALKANE_ID as string;

  return useMutation({
    mutationFn: async (unwrapData: UnwrapZecTransactionData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress && !segwitAddress) {
        throw new Error('No wallet address available');
      }
      const primaryAddress = taprootAddress || segwitAddress;

      if (!provider.walletIsLoaded()) {
        throw new Error('Wallet not loaded in provider');
      }

      const unwrapAmount = toAlks(unwrapData.amount);
      const protostone = buildUnwrapZecProtostone({ frzecId: FRZEC_ALKANE_ID });
      const inputRequirements = buildUnwrapZecInputRequirements({
        frzecId: FRZEC_ALKANE_ID,
        amount: unwrapAmount,
      });

      const btcNetwork = getBitcoinNetwork(network);
      const isBrowserWallet = walletType === 'browser';
      const useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest';

      const fromAddresses = useActualAddresses
        ? [segwitAddress, taprootAddress].filter(Boolean) as string[]
        : ['p2wpkh:0', 'p2tr:0'];

      const toAddresses = useActualAddresses
        ? [(segwitAddress || taprootAddress)!]
        : ['p2wpkh:0'];

      const changeAddr = useActualAddresses
        ? (segwitAddress || taprootAddress)
        : 'p2wpkh:0';

      const alkanesChangeAddr = useActualAddresses
        ? primaryAddress
        : 'p2tr:0';

      console.log('[UNWRAP-ZEC] amount:', unwrapAmount, 'from:', fromAddresses);

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
            title: 'Confirm Unwrap frZEC',
            fromAmount: unwrapData.amount,
            fromSymbol: 'frZEC',
            toAmount: unwrapData.amount,
            toSymbol: 'BTC',
            feeRate: unwrapData.feeRate,
          });
          if (!approved) throw new Error('Transaction rejected by user');
        }

        let signedPsbtBase64: string;
        if (isBrowserWallet) {
          signedPsbtBase64 = await signTaprootPsbt(finalPsbtBase64);
        } else {
          signedPsbtBase64 = await signSegwitPsbt(finalPsbtBase64);
          signedPsbtBase64 = await signTaprootPsbt(signedPsbtBase64);
        }

        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        const alreadyFinalized = signedPsbt.data.inputs.every(input =>
          input.finalScriptWitness || input.finalScriptSig
        );
        if (!alreadyFinalized) {
          signedPsbt.finalizeAllInputs();
        }

        const tx = signedPsbt.extractTransaction();
        const broadcastTxid = await provider.broadcastTransaction(tx.toHex());
        console.log('[UNWRAP-ZEC] Broadcast:', broadcastTxid || tx.getId());

        return { success: true, transactionId: broadcastTxid || tx.getId() };
      }

      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true, transactionId: txId };
      }

      return { success: true, transactionId: result?.txid || result?.reveal_txid };
    },
    onSuccess: () => {
      console.log('[UNWRAP-ZEC] Success, refetching balances');
      queryClient.refetchQueries({ queryKey: ['alkane-balances'] });
      queryClient.refetchQueries({ queryKey: ['sellable-currencies'] });
      queryClient.refetchQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
    },
  });
}
