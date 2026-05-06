/**
 * useWrapEthMutation - Wrap BTC into frETH
 *
 * Mirrors useWrapMutation but targets frETH [4:n] instead of frBTC [32:0].
 *
 * Key differences from frBTC:
 * - AlkaneId [4:n] (FROST wrapped ETH) vs [32:0] (FROST wrapped assets)
 * - Signer is a P2TR (Schnorr), same as frBTC
 * - Same opcode 77 for wrap, 78 for unwrap
 * - 0.1% premium (same as frBTC)
 *
 * Output ordering:
 *   - Output 0 (v0): FROST signer address (receives BTC via B:amount:v0)
 *   - Output 1 (v1): User address (receives minted frETH via pointer=v1)
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getConfig } from '@/utils/getConfig';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import { buildWrapEthProtostone } from '@/lib/alkanes/builders';
import { FRETH_SIGNER_ADDRESSES } from '@/lib/alkanes/constants';
import { requireTaprootForFrost } from '@/lib/wallet/frostGuard';

bitcoin.initEccLib(ecc);

export type WrapEthTransactionData = {
  amount: string; // display units (BTC)
  feeRate: number; // sats/vB
};

/** Get frETH signer address for the current network. */
function getFrethSignerAddress(network: string | undefined): string {
  const key = network || 'regtest';
  return FRETH_SIGNER_ADDRESSES[key] || FRETH_SIGNER_ADDRESSES.devnet || '';
}

export function useWrapEthMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, txContext } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();

  // frETH AlkaneId — deployed contract [4:n], from network config
  const FRETH_ALKANE_ID = (getConfig(network) as any).FRETH_ALKANE_ID as string;

  return useMutation({
    mutationFn: async (wrapData: WrapEthTransactionData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }
      // See `WalletContext.TxContext` jsdoc for the address-fallback semantics.
      if (!txContext) throw new Error('Wallet not connected');

      const amountStr = String(wrapData.amount).replace(/,/g, '').trim();
      const wrapAmountSats = Math.floor(parseFloat(amountStr) * 100000000);
      if (isNaN(wrapAmountSats) || wrapAmountSats <= 0) {
        throw new Error(`Invalid wrap amount: "${wrapData.amount}"`);
      }
      console.log('[WRAP-ETH] Starting wrap:', wrapAmountSats, 'sats');

      const protostone = buildWrapEthProtostone({ frethId: FRETH_ALKANE_ID });
      const inputRequirements = `B:${wrapAmountSats}:v0`;

      const userTaprootAddress = requireTaprootForFrost(
        account?.taproot?.address,
        'wrap to frETH',
      );
      const userSegwitAddress = account?.nativeSegwit?.address;

      const btcNetwork = getBitcoinNetwork(network);
      const signerAddress = getFrethSignerAddress(network);
      if (!signerAddress) {
        throw new Error('frETH signer address not configured for this network');
      }

      const isBrowserWallet = walletType === 'browser';
      // toAddresses: [signer (BTC), user (frETH)] — same layout as BTC wrap.
      const toAddresses = [signerAddress, userTaprootAddress];

      console.log('[WRAP-ETH] signer:', signerAddress, 'user:', userTaprootAddress);

      const result = await provider.alkanesExecuteTyped({
        txContext,
        toAddresses,
        inputRequirements,
        protostones: protostone,
        feeRate: wrapData.feeRate,
        autoConfirm: false,
        mineEnabled: false,
      });

      if (result?.complete) {
        const txId = result.complete?.reveal_txid || result.complete?.commit_txid;
        return { success: true, transactionId: txId, wrapAmountSats };
      }

      if (result?.readyToSign) {
        let psbtBase64 = extractPsbtBase64(result.readyToSign.psbt);

        // Input-only patching for browser wallets
        if (isBrowserWallet) {
          const { patchInputWitnessScripts, injectRedeemScripts } = await import('@/lib/psbt-patching');
          const tempPsbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
          patchInputWitnessScripts(tempPsbt, {
            taprootAddress: userTaprootAddress,
            segwitAddress: userSegwitAddress,
            network: btcNetwork,
          });
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

        // Keystore confirmation
        if (walletType === 'keystore') {
          const approved = await requestConfirmation({
            type: 'wrap',
            title: 'Confirm Wrap ETH',
            fromAmount: wrapData.amount,
            fromSymbol: 'BTC',
            toAmount: wrapData.amount,
            toSymbol: 'frETH',
            feeRate: wrapData.feeRate,
          });
          if (!approved) throw new Error('Transaction rejected by user');
        }

        // Single signing path. Browser wallets sign all input types via the wallet
        // adapter; keystore is taproot-only (BIP86) — `signSegwitPsbt` throws.
        const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

        // Finalize and broadcast
        const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
        const alreadyFinalized = signedPsbt.data.inputs.every(input =>
          input.finalScriptWitness || input.finalScriptSig
        );
        if (!alreadyFinalized) {
          signedPsbt.finalizeAllInputs();
        }

        const tx = signedPsbt.extractTransaction();
        const txid = tx.getId();
        const broadcastTxid = await provider.broadcastTransaction(tx.toHex());
        console.log('[WRAP-ETH] Broadcast:', broadcastTxid || txid);

        return { success: true, transactionId: broadcastTxid || txid, wrapAmountSats };
      }

      const txId = result?.txid || result?.reveal_txid;
      return { success: true, transactionId: txId, wrapAmountSats };
    },
    onSuccess: (data) => {
      console.log('[WRAP-ETH] Success:', data.transactionId);
      queryClient.refetchQueries({ queryKey: ['alkane-balances'] });
      queryClient.refetchQueries({ queryKey: ['sellable-currencies'] });
      queryClient.refetchQueries({ queryKey: ['btc-balance'] });
      queryClient.refetchQueries({ queryKey: ['enriched-wallet'] });
    },
  });
}
