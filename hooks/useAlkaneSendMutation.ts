import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

import { useWallet } from '@/context/WalletContext';
import { useTransactionConfirm } from '@/context/TransactionConfirmContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { useWalletUtxoCache } from './useWalletUtxoCache';
import { getBitcoinNetwork, extractPsbtBase64 } from '@/lib/alkanes/helpers';
import { patchInputsOnly } from '@/lib/psbt-patching';
import {
  buildTransferProtostone,
  buildTransferInputRequirements,
} from '@/lib/alkanes/builders';
import { buildPlanFromTx } from '@/lib/alkanes/planBuilder';
import { getTokenSymbol } from '@/lib/alkanes-client';

bitcoin.initEccLib(ecc);

export type AlkaneSendData = {
  alkaneId: string;
  /** Base-units amount as a stringified BigInt (decimals already applied by caller). */
  amountBaseUnits: string;
  /** Recipient address. Caller must validate. */
  recipientAddress: string;
  feeRate: number;
};

export type AlkaneSendResult = {
  success: boolean;
  transactionId: string | null;
  alkaneId: string;
  amountBaseUnits: string;
};

export function useAlkaneSendMutation() {
  const {
    account, network, isConnected, signTaprootPsbt, walletType, txContext,
  } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();
  const { requestConfirmation } = useTransactionConfirm();
  // Pre-warmed UTXO snapshot — lets the SDK skip its internal BTC-fee
  // fanout. Latency win for wallets with many dust UTXOs.
  const utxoCache = useWalletUtxoCache();
  return useMutation<AlkaneSendResult, Error, AlkaneSendData>({
    mutationFn: async (data: AlkaneSendData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!txContext) throw new Error('Wallet not connected');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }
      const isKeystoreWallet = walletType === 'keystore';

      const protostones = buildTransferProtostone({
        alkaneId: data.alkaneId,
        amount: data.amountBaseUnits,
      });
      const inputRequirements = buildTransferInputRequirements({
        alkaneId: data.alkaneId,
        amount: data.amountBaseUnits,
      });

      // v0 = sender (alkane change via pointer), v1 = recipient (edict transfer).
      const toAddresses: string[] = [txContext.alkanesChangeAddress, data.recipientAddress];

      // ordinals_strategy + paymentUtxos are auto-applied by alkanesExecuteTyped
      // from txContext.walletType: browser → 'preserve' + UniSat-clean-utxos,
      // keystore → 'burn' + no payment_utxos. See lib/alkanes/execute.ts.
      const btcNetwork = getBitcoinNetwork(network);
      const ourAddresses = [
        account?.taproot?.address,
        account?.nativeSegwit?.address,
      ].filter((a): a is string => !!a);
      const symbol = getTokenSymbol(data.alkaneId, undefined);
      const displayAmount = (Number(data.amountBaseUnits) / 1e8).toString();
      const execResult = await provider.alkanesExecuteTyped({
        txContext,
        protostones,
        inputRequirements,
        feeRate: data.feeRate,
        toAddresses,
        autoConfirm: isKeystoreWallet,
        network,
        cachedUtxos: utxoCache.utxos,
        // Keystore-only: PSBT preview before broadcast.
        previewBeforeBroadcast: isKeystoreWallet
          ? async (psbtBase64: string) => {
              const plan = buildPlanFromTx({
                psbtBase64,
                cache: utxoCache,
                ourAddresses,
                network: btcNetwork,
                feeRateSatVb: data.feeRate,
                label: `Send ${symbol}`,
                summary: `Transfers ${displayAmount} ${symbol} to ${data.recipientAddress}.`,
              });
              // The recipient (v1) output is dust — annotate it with the
              // outgoing alkane edict so the modal shows what's leaving.
              const recipientIdx = plan.outputs.findIndex(
                (o) => o.address === data.recipientAddress,
              );
              if (recipientIdx >= 0) {
                plan.outputs[recipientIdx].alkanes = [
                  ...(plan.outputs[recipientIdx].alkanes ?? []),
                  {
                    alkaneId: data.alkaneId,
                    symbol,
                    amount: BigInt(data.amountBaseUnits),
                    uncertain: false,
                  },
                ];
              }
              return await requestConfirmation({
                type: 'send',
                title: 'Confirm Send',
                recipient: data.recipientAddress,
                fromAmount: displayAmount,
                fromSymbol: symbol,
                fromId: data.alkaneId,
                feeRate: data.feeRate,
                plan: [plan],
              });
            }
          : undefined,
      });

      // Keystore (autoConfirm=true): SDK signs + broadcasts internally.
      if (isKeystoreWallet) {
        const txid = pickTxid(execResult);
        return {
          success: true,
          transactionId: txid,
          alkaneId: data.alkaneId,
          amountBaseUnits: data.amountBaseUnits,
        };
      }

      // Browser: SDK may have auto-confirmed, otherwise returns a readyToSign PSBT.
      if (execResult?.txid || execResult?.reveal_txid) {
        return {
          success: true,
          transactionId: execResult.txid || execResult.reveal_txid,
          alkaneId: data.alkaneId,
          amountBaseUnits: data.amountBaseUnits,
        };
      }

      const readyToSign = execResult?.readyToSign;
      if (!readyToSign?.psbt) {
        throw new Error('SDK did not return a signable PSBT');
      }

      let psbtBase64: string = extractPsbtBase64(readyToSign.psbt);

      // SDK builds the PSBT with a dummy wallet, so witnessUtxo.script and any
      // P2SH redeemScript point at dummy keys. Patch inputs so browser wallets
      // recognise their own keys before signing.
      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('No taproot address available');

      const patchResult = patchInputsOnly({
        psbtBase64,
        network: btcNetwork,
        taprootAddress,
        segwitAddress,
        paymentPubkeyHex: account?.nativeSegwit?.pubkey,
      });
      psbtBase64 = patchResult.psbtBase64;

      const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);

      // UniSat (autoFinalized: true) returns finalized; Xverse / OYL return un-finalized.
      const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
      let tx: bitcoin.Transaction;
      try {
        tx = signedPsbt.extractTransaction();
      } catch {
        signedPsbt.finalizeAllInputs();
        tx = signedPsbt.extractTransaction();
      }

      const broadcastTxid = await provider.broadcastTransaction(tx.toHex());
      return {
        success: true,
        transactionId: broadcastTxid || tx.getId(),
        alkaneId: data.alkaneId,
        amountBaseUnits: data.amountBaseUnits,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['utxos'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
    },
  });
}

function pickTxid(execResult: any): string | null {
  return (
    execResult?.txid ||
    execResult?.reveal_txid ||
    execResult?.tx_id ||
    execResult?.complete?.reveal_txid ||
    execResult?.complete?.commit_txid ||
    execResult?.result?.txid ||
    execResult?.data?.txid ||
    (typeof execResult === 'string' ? execResult : null)
  );
}
