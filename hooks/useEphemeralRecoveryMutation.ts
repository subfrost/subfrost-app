'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { useWallet } from '@/context/WalletContext';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';
import { extractPsbtBase64, getBitcoinNetwork } from '@/lib/alkanes/helpers';
import {
  getAddressUtxos,
  getEsploraTx,
  getProtorunesByOutpoint,
  broadcastTransaction,
  type EsploraTransaction,
  type EsploraUtxo,
} from '@/lib/alkanes/rpc';
import {
  buildDeterministicEphemeralRecoveryPayment,
  deriveXOnlyFromAccount,
  EPHEMERAL_RECOVERY_VOUT,
  extractEphemeralRecoveryXOnlyPubkeys,
  getEphemeralRecoveryRecord,
  getRawEphemeralChildTxRecord,
  paymentFromRecoveryRecord,
  type EphemeralRecoveryRecord,
} from '@/lib/alkanes/ephemeralRecovery';

bitcoin.initEccLib(ecc);

const DUST = 546;
const TAP_LEAF_VERSION = 0xc0;
type AlkaneRequirement = { block: number; tx: number; amount: string };
type RecoveryUtxo = EsploraUtxo & { alkanes: AlkaneRequirement[] };
type RecoveryBuildPlan = {
  inputRequirements: string;
  protostones: string;
  toAddresses: string[];
};
type RecoveryExecuteResult = {
  readyToSign?: { psbt?: unknown };
  ready_to_sign?: { psbt?: unknown };
};

export type EphemeralRecoveryParams = {
  parentTxid: string;
  feeRate: number;
};

export type EphemeralRecoveryResult = {
  transactionId: string;
  recoveredAddress: string;
};

function normalizeTxid(txid: string): string {
  return txid.trim().toLowerCase();
}

async function getEsploraTxHex(network: string, txid: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/esplora/tx/${txid}/hex?network=${encodeURIComponent(network)}`);
    if (!res.ok) return null;
    const hex = (await res.text()).trim();
    return /^[0-9a-f]+$/i.test(hex) ? hex : null;
  } catch {
    return null;
  }
}

function estimateRecoveryFee(feeRate: number, inputCount: number): number {
  return Math.ceil(Math.max(feeRate, 0.1) * (220 + inputCount * 180)) + 500;
}

function aggregateAlkanes(alkanes: AlkaneRequirement[]): AlkaneRequirement[] {
  const byId = new Map<string, bigint>();
  for (const alkane of alkanes) {
    const key = `${alkane.block}:${alkane.tx}`;
    byId.set(key, (byId.get(key) ?? 0n) + BigInt(alkane.amount));
  }
  return [...byId.entries()]
    .map(([key, amount]) => {
      const [block, tx] = key.split(':').map(Number);
      return { block, tx, amount: amount.toString() };
    })
    .filter((a) => BigInt(a.amount) > 0n);
}

async function enrichRecoveryUtxos(params: {
  network: string;
  utxos: EsploraUtxo[];
  record: EphemeralRecoveryRecord;
}): Promise<RecoveryUtxo[]> {
  return Promise.all(params.utxos.map(async (utxo) => {
    if (
      utxo.txid === params.record.parentTxid &&
      utxo.vout === params.record.parentVout &&
      params.record.childAlkanes.length > 0
    ) {
      return { ...utxo, alkanes: params.record.childAlkanes };
    }

    const resp = await getProtorunesByOutpoint(
      params.network,
      utxo.txid,
      utxo.vout,
      AbortSignal.timeout(15_000),
    );
    const alkanes = (resp?.balance_sheet?.cached?.balances ?? []).map((entry) => ({
      block: Number(entry.block),
      tx: Number(entry.tx),
      amount: entry.amount.toString(),
    }));
    return { ...utxo, alkanes };
  }));
}

function buildOnChainRecoveryRecord(params: {
  network: string;
  btcNetwork: bitcoin.Network;
  parentTx: EsploraTransaction;
  userAddress: string;
  userXOnlyPubkey: string;
}): EphemeralRecoveryRecord | null {
  const xOnlyPubkeys = extractEphemeralRecoveryXOnlyPubkeys(params.parentTx);

  for (const ephemeralXOnlyPubkey of xOnlyPubkeys) {
    const payment = buildDeterministicEphemeralRecoveryPayment({
      network: params.btcNetwork,
      networkId: params.network,
      userXOnlyPubkey: params.userXOnlyPubkey,
      ephemeralXOnlyPubkey,
    });
    const parentVout = params.parentTx.vout?.findIndex((vout) => (
      vout.scriptpubkey?.toLowerCase() === payment.outputScriptHex
    )) ?? -1;
    if (parentVout < 0) continue;

    const output = params.parentTx.vout?.[parentVout];
    if (!output) continue;

    return {
      version: 1,
      createdAt: 0,
      network: params.network,
      parentTxid: params.parentTx.txid,
      parentVout,
      userAddress: params.userAddress,
      signerAddress: params.userAddress,
      userXOnlyPubkey: params.userXOnlyPubkey,
      ephemeralXOnlyPubkey,
      internalPubkey: payment.internalPubkey.toString('hex'),
      address: payment.address,
      outputScriptHex: payment.outputScriptHex,
      outputValue: Number(output.value),
      childAlkanes: [],
    };
  }

  return null;
}

function buildRecoveryPlan(params: {
  alkanes: AlkaneRequirement[];
  totalValue: number;
  feeRate: number;
  inputCount: number;
  userAddress: string;
  extraFeeReserve?: number;
}): RecoveryBuildPlan {
  const alkaneRequirements = aggregateAlkanes(params.alkanes)
    .map((a) => `${a.block}:${a.tx}:${a.amount}`);
  const needsAlkaneCarrier = alkaneRequirements.length > 0;
  const carrierDust = needsAlkaneCarrier ? DUST : 0;
  const fee = estimateRecoveryFee(params.feeRate, params.inputCount) + Math.max(params.extraFeeReserve ?? 0, 0);
  const btcBack = params.totalValue - carrierDust - fee;

  if (btcBack < DUST) {
    throw new Error('Ephemeral address does not have enough BTC left to recover after fees.');
  }

  const inputRequirements = [
    `B:${btcBack}:v0`,
    ...(needsAlkaneCarrier ? [`B:${DUST}:v1`] : []),
    ...alkaneRequirements,
  ].join(',');

  return {
    inputRequirements,
    protostones: needsAlkaneCarrier ? 'v1:v1' : '',
    toAddresses: needsAlkaneCarrier
      ? [params.userAddress, params.userAddress]
      : [params.userAddress],
  };
}

function getInsufficientFundsShortfall(error: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Insufficient funds:\s*need\s*(\d+)\s*sats,\s*have\s*(\d+)/i);
  if (!match) return null;
  const need = Number(match[1]);
  const have = Number(match[2]);
  return Number.isFinite(need) && Number.isFinite(have) && need > have ? need - have : null;
}

function compactSize(size: number): Buffer {
  if (size < 0xfd) return Buffer.from([size]);
  if (size <= 0xffff) {
    const buffer = Buffer.allocUnsafe(3);
    buffer[0] = 0xfd;
    buffer.writeUInt16LE(size, 1);
    return buffer;
  }
  const buffer = Buffer.allocUnsafe(5);
  buffer[0] = 0xfe;
  buffer.writeUInt32LE(size, 1);
  return buffer;
}

function tapLeafHash(script: Buffer): Buffer {
  return Buffer.from(bitcoin.crypto.taggedHash(
    'TapLeaf',
    Buffer.concat([Buffer.from([TAP_LEAF_VERSION]), compactSize(script.length), script]),
  ));
}

function normalizeDerivationPath(path?: string): string {
  if (path && path.startsWith('m')) return path;
  return 'm';
}

function patchRecoveryLeaf(params: {
  psbtBase64: string;
  record: EphemeralRecoveryRecord;
  network: bitcoin.Network;
  taprootPath?: string;
}): string {
  const payment = paymentFromRecoveryRecord(params.record, params.network);
  const psbt = bitcoin.Psbt.fromBase64(params.psbtBase64, { network: params.network });
  const userPubkey = Buffer.from(params.record.userXOnlyPubkey, 'hex');
  const userLeafHash = tapLeafHash(payment.userLeafScript);
  const derivationPath = normalizeDerivationPath(params.taprootPath);
  let patched = 0;

  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    const scriptHex = input.witnessUtxo?.script
      ? Buffer.from(input.witnessUtxo.script).toString('hex')
      : '';
    if (scriptHex !== params.record.outputScriptHex && scriptHex !== payment.outputScriptHex) {
      continue;
    }

    input.tapInternalKey = payment.internalPubkey;
    input.tapLeafScript = [{
      leafVersion: TAP_LEAF_VERSION,
      script: payment.userLeafScript,
      controlBlock: payment.userControlBlock,
    }];
    input.tapBip32Derivation = [{
      masterFingerprint: Buffer.alloc(4),
      pubkey: userPubkey,
      path: derivationPath,
      leafHashes: [userLeafHash],
    }];
    patched++;
  }

  if (patched === 0) {
    throw new Error('Recovery PSBT did not include the stored ephemeral output.');
  }

  return psbt.toBase64();
}

function extractRecoveryTx(psbtBase64: string, network: bitcoin.Network): { txHex: string; txid: string } {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network });
  try {
    const tx = psbt.extractTransaction();
    return { txHex: tx.toHex(), txid: tx.getId() };
  } catch {
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    return { txHex: tx.toHex(), txid: tx.getId() };
  }
}

export function useEphemeralRecoveryMutation() {
  const { network, address, account, signTaprootPsbt } = useWallet();
  const provider = useSandshrewProvider();
  const queryClient = useQueryClient();

  return useMutation<EphemeralRecoveryResult, Error, EphemeralRecoveryParams>({
    mutationFn: async ({ parentTxid, feeRate }) => {
      if (!provider) throw new Error('Provider not available');
      if (!address) throw new Error('No wallet address available. Please connect a wallet first.');

      const txid = normalizeTxid(parentTxid);
      if (!/^[0-9a-f]{64}$/.test(txid)) {
        throw new Error('Enter a valid tx1 transaction id.');
      }

      const parentTx = await getEsploraTx(network, txid);
      if (!parentTx) {
        throw new Error('Tx1 was not found by Esplora on the current network.');
      }
      const parentTxHex = await getEsploraTxHex(network, txid);

      const btcNetwork = getBitcoinNetwork(network);
      const userXOnlyPubkey = deriveXOnlyFromAccount(account);
      const localRecord = getEphemeralRecoveryRecord(network, txid, EPHEMERAL_RECOVERY_VOUT);
      const onChainRecord = userXOnlyPubkey ? buildOnChainRecoveryRecord({
        network,
        btcNetwork,
        parentTx,
        userAddress: address,
        userXOnlyPubkey,
      }) : null;
      const record = localRecord ?? onChainRecord;
      if (!record) {
        const rawChild = getRawEphemeralChildTxRecord(network, txid, EPHEMERAL_RECOVERY_VOUT);
        if (!rawChild) {
          throw new Error('No on-chain or local ephemeral recovery data was found for this txid on the current network.');
        }
        if (rawChild.userAddress !== address) {
          throw new Error('Connected wallet does not match the wallet that created this ephemeral output.');
        }

        const transactionId = await broadcastTransaction(network, rawChild.txHex);
        if (typeof window !== 'undefined') {
          try {
            const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
            await pendingTxStore.add(rawChild.txHex);
          } catch (error) {
            console.warn('[ephemeralRecovery] raw child pendingTxStore.add failed:', error);
          }
        }

        queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
        queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
        queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });

        return {
          transactionId: transactionId || rawChild.txid,
          recoveredAddress: rawChild.address,
        };
      }
      if (record.userAddress !== address) {
        throw new Error('Connected wallet does not match the wallet that created this ephemeral output.');
      }

      const parentVout = parentTx.vout?.[record.parentVout];
      if (!parentVout) {
        throw new Error('Tx1 does not contain the stored ephemeral output.');
      }
      if (parentVout.scriptpubkey_address && parentVout.scriptpubkey_address !== record.address) {
        throw new Error('Tx1 output does not match the stored ephemeral address.');
      }

      const currentUtxos = await getAddressUtxos(network, record.address, AbortSignal.timeout(15_000));
      const hasStoredParent = currentUtxos.some((utxo) => (
        utxo.txid === record.parentTxid && utxo.vout === record.parentVout
      ));
      const shouldSynthesizeUnconfirmedParent =
        currentUtxos.length === 0 &&
        parentVout.value > 0 &&
        parentTx.status?.confirmed === false &&
        !hasStoredParent;

      if (shouldSynthesizeUnconfirmedParent) {
        currentUtxos.push({
          txid: record.parentTxid,
          vout: record.parentVout,
          value: Number(parentVout.value),
          status: {
            confirmed: parentTx.status?.confirmed ?? false,
            block_height: parentTx.status?.block_height,
          },
        });
      }
      if (currentUtxos.length === 0) {
        throw new Error('The ephemeral address has no spendable UTXOs to recover. If this transaction was replaced, recover using the replacement txid.');
      }

      const recoveryUtxos = await enrichRecoveryUtxos({ network, utxos: currentUtxos, record });
      const totalValue = recoveryUtxos.reduce((sum, u) => sum + Number(u.value || 0), 0);
      const allAlkanes = recoveryUtxos.flatMap((u) => u.alkanes);
      const prefetchedUtxos = recoveryUtxos.map((u) => ({
        outpoint: `${u.txid}:${u.vout}`,
        value: Number(u.value),
        script_pubkey_hex: record.outputScriptHex,
        alkanes: u.alkanes,
      }));
      let extraFeeReserve = 0;
      let result: RecoveryExecuteResult | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const plan = buildRecoveryPlan({
          alkanes: allAlkanes,
          totalValue,
          feeRate,
          inputCount: recoveryUtxos.length,
          userAddress: record.userAddress,
          extraFeeReserve,
        });

        try {
          result = await provider.alkanesExecuteTyped({
            inputRequirements: plan.inputRequirements,
            protostones: plan.protostones,
            feeRate,
            autoConfirm: false,
            forcePsbt: true,
            fromAddresses: [record.address],
            toAddresses: plan.toAddresses,
            changeAddress: record.userAddress,
            alkanesChangeAddress: record.userAddress,
            network,
            ordinalsStrategy: 'burn',
            prefetchedUtxos,
            knownPendingTxHexes: shouldSynthesizeUnconfirmedParent && parentTxHex ? [parentTxHex] : [],
          }) as RecoveryExecuteResult;
          break;
        } catch (error) {
          const shortfall = getInsufficientFundsShortfall(error);
          if (shortfall === null || attempt === 2) {
            throw error;
          }
          extraFeeReserve += shortfall + 1_000;
        }
      }

      const ready = result?.readyToSign ?? result?.ready_to_sign;
      if (!ready?.psbt) {
        throw new Error('Recovery builder did not return a PSBT to sign.');
      }

      const recoveryPsbt = patchRecoveryLeaf({
        psbtBase64: extractPsbtBase64(ready.psbt),
        record,
        network: btcNetwork,
        taprootPath: account?.taproot?.hdPath,
      });
      const signedPsbt = await signTaprootPsbt(recoveryPsbt);
      const tx = extractRecoveryTx(signedPsbt, btcNetwork);
      const transactionId = await broadcastTransaction(network, tx.txHex);

      if (typeof window !== 'undefined') {
        try {
          const { pendingTxStore } = await import('@/lib/alkanes/pendingTxStore');
          await pendingTxStore.add(tx.txHex);
        } catch (error) {
          console.warn('[ephemeralRecovery] pendingTxStore.add failed:', error);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['btc-balance'] });
      queryClient.invalidateQueries({ queryKey: ['alkane-balances'] });
      queryClient.invalidateQueries({ queryKey: ['enriched-wallet'] });

      return {
        transactionId: transactionId || tx.txid,
        recoveredAddress: record.address,
      };
    },
  });
}
