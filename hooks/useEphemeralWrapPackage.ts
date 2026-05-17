'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairInterface } from 'ecpair';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { useWalletUtxoCache } from '@/hooks/useWalletUtxoCache';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import { patchInputsOnly } from '@/lib/psbt-patching';
import { broadcastTransaction, broadcastTransactions as broadcastRawTransactions } from '@/lib/alkanes/rpc';
import {
  buildEphemeralRecoveryKey,
  buildEphemeralRecoveryOpReturnScript,
  buildSingleEphemeralKey,
  deriveXOnlyFromAccount,
  EPHEMERAL_RECOVERY_VOUT,
  getSwapTxTestMode,
  saveRawEphemeralChildTxRecord,
  type EphemeralRecoveryPayment,
  type SingleEphemeralKey,
} from '@/lib/alkanes/ephemeralRecovery';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const EPHEMERAL_CARRIER_VOUT = EPHEMERAL_RECOVERY_VOUT;
const DUST = 546;
const RECOVERY_DESCRIPTOR_FEE_BUFFER = 20;
const CPFP_PARENT_FEE_RATE = 0.15;
const CPFP_ESTIMATED_PARENT_VBYTES = 700;
const CPFP_ESTIMATED_CHILD_VBYTES = 650;
const CPFP_CHILD_FEE_RESERVE = 5_000;

type AlkaneAssertion = { block: number; tx: number; amount: string };
type MutablePsbtOutput = { script: Uint8Array; value: bigint | number };
type PsbtInternalTx = {
  ins?: Array<{ index: number }>;
  outs?: MutablePsbtOutput[];
  virtualSize?: () => number;
};
type PsbtOutputCache = {
  __CACHE?: {
    __TX?: PsbtInternalTx;
    __FEE?: unknown;
    __FEE_RATE?: unknown;
    __EXTRACTED_TX?: unknown;
  };
};

function getPackageFeeRate(packageFeeRate: number): number {
  if (!Number.isFinite(packageFeeRate) || packageFeeRate <= 0) {
    throw new Error(`Invalid package fee rate: ${packageFeeRate}`);
  }
  return packageFeeRate;
}

export type EphemeralWrapPackageParams = {
  feeRate: number;
  signerAddress: string;
  userAddress: string;
  parentInputRequirements: string;
  parentProtostone: string;
  parentExtraToAddresses?: string[];
  childInputRequirements: string;
  childProtostone: string;
  childAlkanes: AlkaneAssertion[];
  childToAddresses?: string[];
  childAlkanesChangeAddress?: string;
  invalidate?: 'swap' | 'addLiquidity';
  splitTransactions?: boolean;
};

function estimateEphemeralFunding(packageFeeRate: number): number {
  // Tx B is normally 1 P2TR input + user dust output + BTC change + OP_RETURN.
  // Fund the child with enough sats to carry the whole package fee. The child
  // later patches its BTC change output to the exact package fee target after
  // both transaction virtual sizes are known.
  const packageFee = Math.ceil(getPackageFeeRate(packageFeeRate) * (CPFP_ESTIMATED_PARENT_VBYTES + CPFP_ESTIMATED_CHILD_VBYTES));
  return DUST + packageFee + CPFP_CHILD_FEE_RESERVE;
}

function estimateRecoveryDescriptorFee(feeRate: number, script: Buffer): number {
  const outputVbytes = 8 + 1 + script.length;
  return Math.ceil(Math.max(feeRate, 0) * outputVbytes) + RECOVERY_DESCRIPTOR_FEE_BUFFER;
}

function getMutablePsbtOutputs(psbt: bitcoin.Psbt): MutablePsbtOutput[] {
  const outputs = (psbt as unknown as PsbtOutputCache).__CACHE?.__TX?.outs;
  if (!Array.isArray(outputs)) {
    throw new Error('Unable to patch recovery descriptor output fee');
  }
  return outputs;
}

function outputValue(value: bigint | number): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function setOutputValue(output: { value: bigint | number }, value: number): void {
  output.value = typeof output.value === 'bigint' ? BigInt(value) : value;
}

function clearPsbtMutationCache(psbt: bitcoin.Psbt): void {
  const cache = (psbt as unknown as PsbtOutputCache).__CACHE;
  if (!cache) return;
  cache.__FEE = undefined;
  cache.__FEE_RATE = undefined;
  cache.__EXTRACTED_TX = undefined;
}

function psbtInputValue(psbt: bitcoin.Psbt, inputIndex: number): number {
  const input = psbt.data.inputs[inputIndex];
  const witnessValue = input?.witnessUtxo?.value;
  if (witnessValue !== undefined) return outputValue(witnessValue);

  if (input?.nonWitnessUtxo) {
    const prevTx = bitcoin.Transaction.fromBuffer(Buffer.from(input.nonWitnessUtxo));
    const txInput = (psbt as unknown as PsbtOutputCache).__CACHE?.__TX?.ins?.[inputIndex];
    const prevoutIndex = txInput?.index;
    if (prevoutIndex === undefined) {
      throw new Error(`Unable to resolve non-witness input #${inputIndex}`);
    }
    const prevout = prevTx.outs[prevoutIndex];
    if (!prevout) {
      throw new Error(`Missing previous output for input #${inputIndex}`);
    }
    return outputValue(prevout.value);
  }

  throw new Error(`PSBT input #${inputIndex} is missing UTXO value`);
}

function psbtInputTotal(psbt: bitcoin.Psbt): number {
  let total = 0;
  for (let i = 0; i < psbt.inputCount; i++) {
    total += psbtInputValue(psbt, i);
  }
  return total;
}

function outputTotal(outputs: MutablePsbtOutput[]): number {
  return outputs.reduce((sum, output) => sum + outputValue(output.value), 0);
}

function psbtFee(psbt: bitcoin.Psbt): number {
  return psbtInputTotal(psbt) - outputTotal(getMutablePsbtOutputs(psbt));
}

function getPsbtInputScript(psbt: bitcoin.Psbt, inputIndex: number): Buffer | null {
  const input = psbt.data.inputs[inputIndex];
  if (input?.witnessUtxo?.script) return Buffer.from(input.witnessUtxo.script);

  if (input?.nonWitnessUtxo) {
    const prevTx = bitcoin.Transaction.fromBuffer(Buffer.from(input.nonWitnessUtxo));
    const txInput = (psbt as unknown as PsbtOutputCache).__CACHE?.__TX?.ins?.[inputIndex];
    const prevoutIndex = txInput?.index;
    if (prevoutIndex === undefined) return null;
    return prevTx.outs[prevoutIndex]?.script ? Buffer.from(prevTx.outs[prevoutIndex].script) : null;
  }

  return null;
}

function estimateInputWitnessVbytes(script: Buffer | null): number {
  const scriptHex = script?.toString('hex') ?? '';
  if (scriptHex.startsWith('5120') && scriptHex.length === 68) {
    return 17; // P2TR key-path signature witness.
  }
  if (scriptHex.startsWith('0014') && scriptHex.length === 44) {
    return 28; // P2WPKH signature + pubkey witness.
  }
  if (scriptHex.startsWith('0020') && scriptHex.length === 68) {
    return 28;
  }
  return 108; // Conservative fallback for legacy/nested inputs.
}

function estimateSignedPsbtVsize(psbt: bitcoin.Psbt): number {
  const unsignedTx = (psbt as unknown as PsbtOutputCache).__CACHE?.__TX;
  const baseVsize = unsignedTx?.virtualSize?.() ?? 0;
  let witnessVbytes = 0;
  for (let i = 0; i < psbt.inputCount; i++) {
    witnessVbytes += estimateInputWitnessVbytes(getPsbtInputScript(psbt, i));
  }
  return Math.max(1, baseVsize + witnessVbytes);
}

function patchParentFeeToFloor(params: {
  psbtBase64: string;
  network: bitcoin.Network;
  carrierOutputScriptHex: string;
  feeRate: number;
}): { psbtBase64: string; targetFee: number; originalFee: number; estimatedVsize: number } {
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  const outputs = getMutablePsbtOutputs(psbt);
  const carrier = outputs[EPHEMERAL_CARRIER_VOUT];
  if (!carrier || Buffer.from(carrier.script).toString('hex') !== params.carrierOutputScriptHex) {
    throw new Error('Parent PSBT is missing the ephemeral fee carrier output');
  }

  const originalFee = psbtFee(psbt);
  const estimatedVsize = estimateSignedPsbtVsize(psbt);
  const targetFee = Math.ceil(Math.max(params.feeRate, 0) * estimatedVsize);
  const feeDelta = originalFee - targetFee;

  if (feeDelta > 0) {
    setOutputValue(carrier, outputValue(carrier.value) + feeDelta);
    clearPsbtMutationCache(psbt);
  } else if (feeDelta < 0) {
    const nextValue = outputValue(carrier.value) + feeDelta;
    if (nextValue <= DUST) {
      throw new Error('Parent PSBT carrier cannot fund the minimum parent relay fee');
    }
    setOutputValue(carrier, nextValue);
    clearPsbtMutationCache(psbt);
  }

  return {
    psbtBase64: psbt.toBase64(),
    targetFee,
    originalFee,
    estimatedVsize,
  };
}

function transactionOutputTotal(tx: bitcoin.Transaction): number {
  return tx.outs.reduce((sum, output) => sum + outputValue(output.value), 0);
}

function extractSignedTxInfo(
  psbtBase64: string,
  network: bitcoin.Network,
): { txHex: string; txid: string; fee: number; vsize: number } {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  const inputTotal = psbtInputTotal(psbt);
  const finalized = psbt.data.inputs.every((input) => input.finalScriptWitness || input.finalScriptSig);
  if (!finalized) {
    psbt.finalizeAllInputs();
  }
  const tx = psbt.extractTransaction();
  return {
    txHex: tx.toHex(),
    txid: tx.getId(),
    fee: inputTotal - transactionOutputTotal(tx),
    vsize: tx.virtualSize(),
  };
}

function patchPsbtFee(params: {
  psbtBase64: string;
  network: bitcoin.Network;
  targetFee: number;
  changeAddress: string;
}): string {
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  const currentFee = psbtFee(psbt);
  const additionalFee = Math.ceil(params.targetFee) - currentFee;
  if (additionalFee <= 0) return params.psbtBase64;

  const changeScriptHex = Buffer.from(
    bitcoin.address.toOutputScript(params.changeAddress, params.network),
  ).toString('hex');
  const outputs = getMutablePsbtOutputs(psbt);
  let changeIndex = -1;
  for (let index = outputs.length - 1; index >= 0; index--) {
    if (Buffer.from(outputs[index].script).toString('hex') === changeScriptHex) {
      changeIndex = index;
      break;
    }
  }
  if (changeIndex === -1) {
    throw new Error('Child PSBT is missing a BTC change output to pay the package fee');
  }

  const changeOutput = outputs[changeIndex];
  const nextValue = outputValue(changeOutput.value) - additionalFee;
  if (nextValue < DUST) {
    throw new Error(
      `Child PSBT has insufficient BTC change for package fee: needs ${additionalFee} sats, change has ${outputValue(changeOutput.value)} sats`,
    );
  }

  setOutputValue(changeOutput, nextValue);
  clearPsbtMutationCache(psbt);
  return psbt.toBase64();
}

function foldEphemeralOutputsIntoCarrierPsbt(psbt: bitcoin.Psbt, ephemeralOutputScriptHex: string): void {
  const outputs = getMutablePsbtOutputs(psbt);
  const carrier = outputs[EPHEMERAL_CARRIER_VOUT];
  if (!carrier || Buffer.from(carrier.script).toString('hex') !== ephemeralOutputScriptHex) {
    return;
  }

  for (let index = outputs.length - 1; index >= 0; index--) {
    if (index === EPHEMERAL_CARRIER_VOUT) continue;
    const output = outputs[index];
    if (Buffer.from(output.script).toString('hex') !== ephemeralOutputScriptHex) continue;
    setOutputValue(carrier, outputValue(carrier.value) + outputValue(output.value));
    outputs.splice(index, 1);
    psbt.data.outputs.splice(index, 1);
  }
  clearPsbtMutationCache(psbt);
}

function foldEphemeralOutputsIntoCarrier(params: {
  psbtBase64: string;
  network: bitcoin.Network;
  ephemeralOutputScriptHex: string;
}): string {
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  foldEphemeralOutputsIntoCarrierPsbt(psbt, params.ephemeralOutputScriptHex);
  return psbt.toBase64();
}

function addRecoveryDescriptorOutput(params: {
  psbtBase64: string;
  network: bitcoin.Network;
  descriptorScript: Buffer;
  ephemeralOutputScriptHex: string;
  feeRate: number;
}): string {
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  foldEphemeralOutputsIntoCarrierPsbt(psbt, params.ephemeralOutputScriptHex);
  const extraFee = estimateRecoveryDescriptorFee(params.feeRate, params.descriptorScript);
  psbt.addOutput({ script: params.descriptorScript, value: 0n });

  const outputs = getMutablePsbtOutputs(psbt);
  const carrier = outputs[EPHEMERAL_CARRIER_VOUT];
  if (
    !carrier ||
    Buffer.from(carrier.script).toString('hex') !== params.ephemeralOutputScriptHex ||
    outputValue(carrier.value) <= extraFee + DUST
  ) {
    throw new Error('Ephemeral parent PSBT does not have enough change to add the recovery descriptor');
  }

  setOutputValue(carrier, outputValue(carrier.value) - extraFee);
  clearPsbtMutationCache(psbt);
  return psbt.toBase64();
}

function signEphemeralChildPsbt(params: {
  psbtBase64: string;
  network: bitcoin.Network;
  keyPair: ECPairInterface;
  payment: EphemeralRecoveryPayment;
}): { txHex: string; txid: string } {
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  const outputScriptHex = params.payment.outputScriptHex;

  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    const scriptHex = input.witnessUtxo?.script
      ? Buffer.from(input.witnessUtxo.script).toString('hex')
      : '';
    if (scriptHex === outputScriptHex) {
      input.tapLeafScript = [{
        leafVersion: 0xc0,
        script: params.payment.ephemeralLeafScript,
        controlBlock: params.payment.ephemeralControlBlock,
      }];
    }
    psbt.signInput(i, params.keyPair);
  }
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { txHex: tx.toHex(), txid: tx.getId() };
}

function tweakedTaprootKeyPair(
  keyPair: ECPairInterface,
  internalPubkey: Buffer,
  network: bitcoin.Network,
): ECPairInterface {
  if (!keyPair.privateKey) {
    throw new Error('Ephemeral keypair missing private key');
  }
  let privateKey = Buffer.from(keyPair.privateKey);
  if (keyPair.publicKey[0] === 0x03) {
    privateKey = Buffer.from(ecc.privateNegate(privateKey));
  }
  const tweak = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);
  const tweaked = ecc.privateAdd(privateKey, tweak);
  if (!tweaked) {
    throw new Error('Ephemeral TapTweak produced an invalid private key');
  }
  return ECPair.fromPrivateKey(Buffer.from(tweaked), { network });
}

function signSingleEphemeralChildPsbt(params: {
  psbtBase64: string;
  network: bitcoin.Network;
  ephemeral: SingleEphemeralKey;
}): { txHex: string; txid: string } {
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  const signer = tweakedTaprootKeyPair(params.ephemeral.keyPair, params.ephemeral.internalPubkey, params.network);

  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    const scriptHex = input.witnessUtxo?.script
      ? Buffer.from(input.witnessUtxo.script).toString('hex')
      : '';
    if (scriptHex === params.ephemeral.outputScriptHex) {
      input.tapInternalKey = params.ephemeral.internalPubkey;
    }
    psbt.signInput(i, signer);
  }
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();
  return { txHex: tx.toHex(), txid: tx.getId() };
}

function zeroEphemeralKey(keyPair: ECPairInterface): void {
  try {
    keyPair.privateKey?.fill(0);
  } catch {
    // Best-effort memory cleanup; JS runtimes may keep internal copies.
  }
}

export function useEphemeralWrapPackage() {
  const {
    account,
    network,
    signTaprootPsbt,
    walletType,
    txContext,
  } = useWallet();
  const provider = useSandshrewProvider();
  const utxoCache = useWalletUtxoCache();
  const queryClient = useQueryClient();

  return useCallback(async (params: EphemeralWrapPackageParams) => {
    if (!provider) throw new Error('Provider not available');
    if (!txContext) throw new Error('No wallet address available. Please connect a wallet first.');

    const btcNetwork = getBitcoinNetwork(network);
    const taprootAddress = account?.taproot?.address;
    const segwitAddress = account?.nativeSegwit?.address;
    const userXOnlyPubkey = deriveXOnlyFromAccount(account);
    const swapTxTestMode = getSwapTxTestMode();
    const useRawChildRecovery = swapTxTestMode === 2 || !userXOnlyPubkey || !taprootAddress;
    const ephemeral = useRawChildRecovery
      ? { mode: 'raw' as const, ...buildSingleEphemeralKey(btcNetwork) }
      : {
        mode: 'taproot-recovery' as const,
        ...buildEphemeralRecoveryKey({ network: btcNetwork, networkId: network, userXOnlyPubkey }),
      };
    const packageFeeRate = getPackageFeeRate(params.feeRate);
    const parentFeeRate = CPFP_PARENT_FEE_RATE;
    const childBuildFeeRate = CPFP_PARENT_FEE_RATE;
    const recoveryDescriptorScript = ephemeral.mode === 'taproot-recovery'
      ? buildEphemeralRecoveryOpReturnScript(ephemeral.ephemeralXOnlyPubkey)
      : null;
    const ephemeralFunding = estimateEphemeralFunding(packageFeeRate) +
      (recoveryDescriptorScript ? estimateRecoveryDescriptorFee(parentFeeRate, recoveryDescriptorScript) : 0);

    try {
      const parentResult = await provider.alkanesExecuteTyped({
        txContext,
        inputRequirements: `${params.parentInputRequirements},B:${ephemeralFunding}:v${EPHEMERAL_CARRIER_VOUT}`,
        protostones: params.parentProtostone,
        feeRate: parentFeeRate,
        autoConfirm: false,
        forcePsbt: true,
        toAddresses: [ephemeral.address, ...(params.parentExtraToAddresses ?? [params.signerAddress])],
        changeAddress: ephemeral.address,
        alkanesChangeAddress: ephemeral.address,
        network,
        cachedUtxos: utxoCache.utxos,
        // Force metashrew utxo_source to suppress SDK's espo data-API call
        // (`essentials.get_address_spendable_outpoints`). cachedUtxos +
        // prefetched_utxos already give the SDK every input it needs;
        // verified 2026-05-17 via HAR that the espo call fires AT click
        // time even with cachedUtxos populated unless utxo_source is set
        // away from the mainnet default of 'espo'.
        utxoSource: 'metashrew',
        // Pin to the metashrew height our cache reflects — SDK filters
        // coin selection to UTXOs at height ≤ this and SKIPS waitForIndexer
        // (no need to wait for metashrew to catch up to bitcoind).
        maxIndexedHeight: utxoCache.height,
        ...(params.splitTransactions !== undefined ? { splitTransactions: params.splitTransactions } : {}),
      });
      const parentReady = parentResult?.readyToSign ?? parentResult?.ready_to_sign;
      if (!parentReady?.psbt) {
        throw new Error('Ephemeral wrap package parent did not return a PSBT to sign');
      }

      let parentPsbtBase64 = extractPsbtBase64(parentReady.psbt);
      if (recoveryDescriptorScript && ephemeral.mode === 'taproot-recovery') {
        parentPsbtBase64 = addRecoveryDescriptorOutput({
          psbtBase64: parentPsbtBase64,
          network: btcNetwork,
          descriptorScript: recoveryDescriptorScript,
          ephemeralOutputScriptHex: ephemeral.outputScriptHex,
          feeRate: parentFeeRate,
        });
      } else {
        parentPsbtBase64 = foldEphemeralOutputsIntoCarrier({
          psbtBase64: parentPsbtBase64,
          network: btcNetwork,
          ephemeralOutputScriptHex: ephemeral.outputScriptHex,
        });
      }
      const parentFeePatch = patchParentFeeToFloor({
        psbtBase64: parentPsbtBase64,
        network: btcNetwork,
        carrierOutputScriptHex: ephemeral.outputScriptHex,
        feeRate: parentFeeRate,
      });
      parentPsbtBase64 = parentFeePatch.psbtBase64;
      if (walletType === 'browser') {
        if (taprootAddress) {
          parentPsbtBase64 = patchInputsOnly({
            psbtBase64: parentPsbtBase64,
            network: btcNetwork,
            taprootAddress,
            segwitAddress,
            paymentPubkeyHex: account?.nativeSegwit?.pubkey,
          }).psbtBase64;
        } else {
          console.warn('[ephemeralWrapPackage] Browser wallet has no taproot address; using raw child tx recovery fallback.');
        }
      }

      const signedParentPsbt = await signTaprootPsbt(parentPsbtBase64);
      const parentTx = extractSignedTxInfo(signedParentPsbt, btcNetwork);
      const decodedParent = bitcoin.Transaction.fromHex(parentTx.txHex);
      const carrierOutput = decodedParent.outs[EPHEMERAL_CARRIER_VOUT];
      if (!carrierOutput) {
        throw new Error('Signed wrap parent is missing the ephemeral carrier output');
      }

      if (swapTxTestMode === 1 && ephemeral.mode === 'taproot-recovery') {
        const wrapTxId = await broadcastTransaction(network, parentTx.txHex);
        if (typeof window !== 'undefined') {
          try {
            const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
            await pendingTxStore.add(parentTx.txHex);
          } catch (error) {
            console.warn('[ephemeralWrapPackage] pendingTxStore.add parent failed:', error);
          }
        }

        queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-utxo-cache'] });
        queryClient.invalidateQueries({ queryKey: ['btc-balance-fast'] });
        queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
        queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
        queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
        queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });

        return {
          success: true,
          transactionId: wrapTxId || parentTx.txid,
          wrapTxId: wrapTxId || parentTx.txid,
          frbtcUnwrapTxId: undefined,
        };
      }

      const childResult = await provider.alkanesExecuteTyped({
        inputRequirements: params.childInputRequirements,
        protostones: params.childProtostone,
        feeRate: childBuildFeeRate,
        autoConfirm: false,
        forcePsbt: true,
        toAddresses: params.childToAddresses ?? [params.userAddress],
        fromAddresses: [ephemeral.address],
        changeAddress: txContext.btcChangeAddress,
        alkanesChangeAddress: params.childAlkanesChangeAddress ?? params.userAddress,
        network,
        ordinalsStrategy: 'burn',
        // Force metashrew utxo_source so the SDK does NOT call its espo
        // data API (`essentials.get_address_spendable_outpoints`) — verified
        // 2026-05-17 via HAR that espo path fires twice per atomic flow
        // even when prefetched_utxos covers the ONLY input the child
        // selects from. The child only spends from `ephemeral.address` and
        // the prefetched_utxos entry below is authoritative for that one
        // outpoint; there's no reason the SDK should ever discover more.
        utxoSource: 'metashrew',
        // Skip the SDK's waitForIndexer poll loop — our cache height is
        // authoritative for which UTXOs are safe to select.
        maxIndexedHeight: utxoCache.height,
        knownPendingTxHexes: [parentTx.txHex],
        // Also pass the user wallet cache as a fallback (covers any edge
        // case where the SDK does still discover beyond the prefetched
        // carrier — would happen if the ephemeral address ever held more
        // than one output, which it shouldn't in this flow).
        cachedUtxos: utxoCache.utxos,
        prefetchedUtxos: [{
          outpoint: `${parentTx.txid}:${EPHEMERAL_CARRIER_VOUT}`,
          value: Number(carrierOutput.value),
          script_pubkey_hex: Buffer.from(carrierOutput.script).toString('hex'),
          alkanes: params.childAlkanes,
        }],
      });
      const childReady = childResult?.readyToSign ?? childResult?.ready_to_sign;
      if (!childReady?.psbt) {
        throw new Error('Ephemeral wrap package child did not return a PSBT to sign');
      }

      const childPsbtBase64 = extractPsbtBase64(childReady.psbt);
      const childPreview = ephemeral.mode === 'taproot-recovery'
        ? signEphemeralChildPsbt({
          psbtBase64: childPsbtBase64,
          network: btcNetwork,
          keyPair: ephemeral.keyPair,
          payment: ephemeral,
        })
        : signSingleEphemeralChildPsbt({
          psbtBase64: childPsbtBase64,
          network: btcNetwork,
          ephemeral,
        });
      const childPreviewTx = bitcoin.Transaction.fromHex(childPreview.txHex);
      const targetPackageFee = Math.ceil(packageFeeRate * (parentTx.vsize + childPreviewTx.virtualSize()));
      const targetChildFee = Math.max(
        Math.ceil(childPreviewTx.virtualSize() * childBuildFeeRate),
        targetPackageFee - parentTx.fee,
      );
      const patchedChildPsbtBase64 = patchPsbtFee({
        psbtBase64: childPsbtBase64,
        network: btcNetwork,
        targetFee: targetChildFee,
        changeAddress: txContext.btcChangeAddress,
      });
      console.log('[ephemeralWrapPackage] cpfp package fees', {
        packageFeeRate,
        parentFeeRate,
        childBuildFeeRate,
        parentOriginalFee: parentFeePatch.originalFee,
        parentTargetFee: parentFeePatch.targetFee,
        parentEstimatedVsize: parentFeePatch.estimatedVsize,
        parentFee: parentTx.fee,
        parentVsize: parentTx.vsize,
        childTargetFee: targetChildFee,
        childVsize: childPreviewTx.virtualSize(),
        targetPackageFee,
      });

      const signedChildTx = ephemeral.mode === 'taproot-recovery'
        ? signEphemeralChildPsbt({
          psbtBase64: patchedChildPsbtBase64,
          network: btcNetwork,
          keyPair: ephemeral.keyPair,
          payment: ephemeral,
        })
        : signSingleEphemeralChildPsbt({
          psbtBase64: patchedChildPsbtBase64,
          network: btcNetwork,
          ephemeral,
        });

      if (ephemeral.mode === 'raw') {
        saveRawEphemeralChildTxRecord({
          version: 1,
          createdAt: Date.now(),
          network,
          parentTxid: parentTx.txid,
          parentVout: EPHEMERAL_CARRIER_VOUT,
          userAddress: params.userAddress,
          address: ephemeral.address,
          outputScriptHex: Buffer.from(carrierOutput.script).toString('hex'),
          outputValue: Number(carrierOutput.value),
          txHex: signedChildTx.txHex,
          txid: signedChildTx.txid,
        });
      }

      if (swapTxTestMode !== 0) {
        const wrapTxId = await broadcastTransaction(network, parentTx.txHex);
        if (typeof window !== 'undefined') {
          try {
            const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
            await pendingTxStore.add(parentTx.txHex);
          } catch (error) {
            console.warn('[ephemeralWrapPackage] pendingTxStore.add parent failed:', error);
          }
        }

        queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-utxo-cache'] });
        queryClient.invalidateQueries({ queryKey: ['btc-balance-fast'] });
        queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
        queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
        queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
        queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });

        return {
          success: true,
          transactionId: wrapTxId || parentTx.txid,
          wrapTxId: wrapTxId || parentTx.txid,
          frbtcUnwrapTxId: undefined,
        };
      }

      const txids = await broadcastRawTransactions(network, [parentTx.txHex, signedChildTx.txHex]);
      if (typeof window !== 'undefined') {
        try {
          const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
          await Promise.all([
            pendingTxStore.add(parentTx.txHex),
            pendingTxStore.add(signedChildTx.txHex),
          ]);
        } catch (error) {
          console.warn('[ephemeralWrapPackage] pendingTxStore.add package failed:', error);
        }
      }

      const wrapTxId = txids[0] || parentTx.txid;
      const transactionId = txids[1] || signedChildTx.txid;

      queryClient.invalidateQueries({ queryKey: ['sellable-currencies'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-utxo-cache'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance-fast'] });
      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['dynamic-pools'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['ammTxHistory'] });
      if (params.invalidate === 'swap') {
        queryClient.invalidateQueries({ queryKey: ['frbtc-premium'] });
        queryClient.invalidateQueries({ queryKey: ['poolFee'] });
        queryClient.invalidateQueries({ queryKey: ['alkanesTokenPairs'] });
      }
      if (params.invalidate === 'addLiquidity') {
        queryClient.invalidateQueries({ queryKey: ['pool-stats'] });
        queryClient.invalidateQueries({ queryKey: ['lp-positions'] });
      }

      return {
        success: true,
        transactionId,
        wrapTxId,
        frbtcUnwrapTxId: undefined,
      };
    } finally {
      zeroEphemeralKey(ephemeral.keyPair);
    }
  }, [account, network, provider, queryClient, signTaprootPsbt, txContext, utxoCache.utxos, walletType]);
}
