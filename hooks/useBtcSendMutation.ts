import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { computeSendFee } from '@alkanes/ts-sdk';

import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from './useSandshrewProvider';
import { getBitcoinNetwork } from '@/lib/alkanes/helpers';
import { injectRedeemScripts } from '@/lib/psbt-patching';
import { sendBtcViaWallet } from '@/lib/wallet/walletCapabilities';

bitcoin.initEccLib(ecc);

export type BtcSendData = {
  recipientAddress: string;
  amountSats: number;
  feeRate: number;
  /** `txid:vout` keys. Browser path spends exactly this set; keystore ignores. */
  selectedUtxoKeys: string[];
  /**
   * Addresses the selected UTXOs were sourced from. Browser path uses these
   * to fetch fresh esplora UTXO listings for the staleness check. Keystore
   * ignores — SDK does its own coinselect against `txContext.feeSourceAddresses`.
   */
  fromAddresses: string[];
};

export type BtcSendResult = {
  success: boolean;
  transactionId: string | null;
  amountSats: number;
};

/** Selected UTXOs disappeared from esplora between auto-select and broadcast. */
export class BtcSendStaleUtxosError extends Error {
  constructor(public missingKeys: string[]) {
    super(`Some selected UTXOs no longer exist on-chain: ${missingKeys.join(', ')}`);
    this.name = 'BtcSendStaleUtxosError';
  }
}

export function useBtcSendMutation() {
  const { account, network, isConnected, signTaprootPsbt, walletType, txContext, browserWallet } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation<BtcSendResult, Error, BtcSendData>({
    mutationFn: async (data: BtcSendData) => {
      if (!isConnected) throw new Error('Wallet not connected');
      if (!provider) throw new Error('Provider not available');
      if (!txContext) throw new Error('Wallet not connected');
      if (!provider.walletIsLoaded()) {
        throw new Error('Provider wallet not loaded. Please reconnect your wallet.');
      }

      if (walletType === 'browser') {
        return await sendBrowser({
          data,
          provider,
          account,
          network,
          signTaprootPsbt,
          txContext,
          browserWalletId: browserWallet?.info?.id,
        });
      }
      return await sendKeystore({ data, provider, network, txContext });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['utxos'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
    },
  });
}

async function sendBrowser(args: {
  data: BtcSendData;
  provider: NonNullable<ReturnType<typeof useSandshrewProvider>>;
  account: ReturnType<typeof useWallet>['account'];
  network: ReturnType<typeof useWallet>['network'];
  signTaprootPsbt: ReturnType<typeof useWallet>['signTaprootPsbt'];
  txContext: NonNullable<ReturnType<typeof useWallet>['txContext']>;
  browserWalletId: string | undefined;
}): Promise<BtcSendResult> {
  const { data, provider, account, network, signTaprootPsbt, txContext, browserWalletId } = args;
  const { recipientAddress, amountSats, feeRate, selectedUtxoKeys, fromAddresses } = data;

  // Native send (UniSat today): wallet picks UTXOs internally with its own
  // asset detection — guarantees no inscription/rune/alkane is burned. Falls
  // through to manual PSBT for wallets without the capability.
  const nativeTxid = await sendBtcViaWallet(browserWalletId, recipientAddress, amountSats, feeRate);
  if (nativeTxid) {
    return { success: true, transactionId: nativeTxid, amountSats };
  }

  // JSON-RPC esplora_address::utxo returns 0 results on mainnet; REST proxy is the supported path.
  const freshUtxos: Array<{ txid: string; vout: number; value: number }> = [];
  for (const addr of fromAddresses) {
    const r = await fetch(`/api/esplora/address/${addr}/utxo?network=${network}`);
    if (!r.ok) continue;
    const arr = await r.json();
    if (Array.isArray(arr)) {
      for (const u of arr) freshUtxos.push({ txid: u.txid, vout: u.vout, value: u.value });
    }
  }

  const freshKeys = new Set(freshUtxos.map(u => `${u.txid}:${u.vout}`));
  const missing = selectedUtxoKeys.filter(k => !freshKeys.has(k));
  if (missing.length > 0) throw new BtcSendStaleUtxosError(missing);

  const btcNetwork = getBitcoinNetwork(network);
  const psbt = new bitcoin.Psbt({ network: btcNetwork });

  // Wallets reject Buffer here ("Expected Uint8Array") — coerce.
  const tapInternalKeyHex = account?.taproot?.pubKeyXOnly;
  const tapInternalKey = tapInternalKeyHex
    ? new Uint8Array(Buffer.from(tapInternalKeyHex, 'hex'))
    : undefined;

  let totalInputValue = 0;
  for (const utxoKey of selectedUtxoKeys) {
    const [txid, voutStr] = utxoKey.split(':');
    const vout = parseInt(voutStr, 10);

    const fresh = freshUtxos.find(u => u.txid === txid && u.vout === vout);
    if (!fresh) throw new Error(`UTXO not found in fresh data: ${utxoKey}`);

    const txHexRes = await fetch(`/api/esplora/tx/${txid}/hex?network=${network}`);
    if (!txHexRes.ok) throw new Error(`Failed to fetch transaction ${txid}: ${txHexRes.statusText}`);
    const tx = bitcoin.Transaction.fromHex(await txHexRes.text());
    const script = tx.outs[vout].script;

    // P2TR scriptPubKey is OP_1 + push 32.
    const isTaprootInput = script.length === 34 && script[0] === 0x51 && script[1] === 0x20;

    const inputData: any = {
      hash: txid,
      index: vout,
      witnessUtxo: { script, value: BigInt(fresh.value) },
    };
    if (isTaprootInput && tapInternalKey) inputData.tapInternalKey = tapInternalKey;

    psbt.addInput(inputData);
    totalInputValue += fresh.value;
  }

  psbt.addOutput({ address: recipientAddress, value: BigInt(amountSats) });

  const fee = computeSendFee({
    inputCount: psbt.txInputs.length,
    sendAmount: amountSats,
    totalInputValue,
    feeRate,
  });
  if (fee.numOutputs === 2 && fee.change > 0) {
    psbt.addOutput({ address: txContext.btcChangeAddress, value: BigInt(fee.change) });
  }

  let psbtBase64 = psbt.toBase64();

  // Xverse legacy P2SH-P2WPKH needs an explicit redeemScript; no-op for native segwit / taproot.
  const paymentAddress = account?.nativeSegwit?.address;
  if (account?.nativeSegwit?.pubkey && paymentAddress) {
    const psbtForPatch = bitcoin.Psbt.fromBase64(psbtBase64, { network: btcNetwork });
    injectRedeemScripts(psbtForPatch, {
      paymentAddress,
      pubkeyHex: account.nativeSegwit.pubkey,
      network: btcNetwork,
    });
    psbtBase64 = psbtForPatch.toBase64();
  }

  const signedPsbtBase64 = await signTaprootPsbt(psbtBase64);
  const signedPsbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });

  // UniSat (autoFinalized: true) returns finalized; Xverse / OYL return un-finalized.
  let txObj: bitcoin.Transaction;
  try {
    txObj = signedPsbt.extractTransaction();
  } catch {
    signedPsbt.finalizeAllInputs();
    txObj = signedPsbt.extractTransaction();
  }

  const broadcastTxid = await provider.broadcastTransaction(txObj.toHex());

  return {
    success: true,
    transactionId: broadcastTxid || txObj.getId(),
    amountSats,
  };
}

async function sendKeystore(args: {
  data: BtcSendData;
  provider: NonNullable<ReturnType<typeof useSandshrewProvider>>;
  network: ReturnType<typeof useWallet>['network'];
  txContext: NonNullable<ReturnType<typeof useWallet>['txContext']>;
}): Promise<BtcSendResult> {
  const { data, provider, network, txContext } = args;
  const { recipientAddress, amountSats, feeRate } = data;

  // Not `walletSend`: WASM `WebProvider::create_transaction` ignores
  // change_address / lock_alkanes / ordinals_strategy (alkanes-rs origin/develop
  // @ 6be90fb1, mainnet tx 39131644...). The B:546:v1 + v1:v1 protostone here
  // captures any alkane edict from spent inputs into the user's taproot —
  // costs ~600 sats but eliminates silent burn risk until upstream is fixed.
  const result = await provider.alkanesExecuteTyped({
    txContext,
    inputRequirements: `B:${amountSats}:v0,B:546:v1`,
    protostones: 'v1:v1',
    feeRate,
    toAddresses: [recipientAddress, txContext.alkanesChangeAddress],
    autoConfirm: true,
    network,
  });

  const txid =
    result?.txid ||
    result?.reveal_txid ||
    result?.tx_id ||
    result?.result?.txid ||
    result?.data?.txid ||
    (typeof result === 'string' ? result : null);

  return { success: true, transactionId: txid, amountSats };
}
