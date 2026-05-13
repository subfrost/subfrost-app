import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairInterface } from 'ecpair';

bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

export const EPHEMERAL_RECOVERY_VOUT = 0;
const STORAGE_PREFIX = 'subfrost_ephemeral_recovery_v1';
const RAW_CHILD_STORAGE_PREFIX = 'subfrost_ephemeral_child_raw_v1';
const RECOVERY_INTERNAL_KEY_TAG = 'subfrost:ephemeral-recovery-internal:v1';

export type EphemeralAlkaneAssertion = {
  block: number;
  tx: number;
  amount: string;
};

export type EphemeralRecoveryRecord = {
  version: 1;
  createdAt: number;
  network: string;
  parentTxid: string;
  parentVout: number;
  userAddress: string;
  signerAddress: string;
  userXOnlyPubkey: string;
  ephemeralXOnlyPubkey: string;
  internalPubkey: string;
  address: string;
  outputScriptHex: string;
  outputValue: number;
  childAlkanes: EphemeralAlkaneAssertion[];
};

export type EphemeralRecoveryPayment = {
  address: string;
  outputScriptHex: string;
  internalPubkey: Buffer;
  userLeafScript: Buffer;
  ephemeralLeafScript: Buffer;
  userControlBlock: Buffer;
  ephemeralControlBlock: Buffer;
};

export type SingleEphemeralKey = {
  keyPair: ECPairInterface;
  internalPubkey: Buffer;
  address: string;
  outputScriptHex: string;
};

export type RawEphemeralChildTxRecord = {
  version: 1;
  createdAt: number;
  network: string;
  parentTxid: string;
  parentVout: number;
  userAddress: string;
  address: string;
  outputScriptHex: string;
  outputValue: number;
  txHex: string;
  txid: string;
};

type TransactionWithVouts = {
  vout?: Array<{ scriptpubkey?: string | null }>;
};

type AccountWithTaproot = {
  taproot?: {
    pubKeyXOnly?: unknown;
    pubkey?: unknown;
  };
};

function assertXOnly(hex: string, label: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(`${label} must be a 32-byte x-only pubkey`);
  }
  return Buffer.from(hex, 'hex');
}

export function xOnlyPubkey(pubkey: Uint8Array): Buffer {
  return Buffer.from(pubkey.length === 32 ? pubkey : pubkey.slice(1, 33));
}

export function deriveXOnlyFromAccount(account: AccountWithTaproot | null | undefined): string | null {
  const direct = account?.taproot?.pubKeyXOnly;
  if (typeof direct === 'string' && /^[0-9a-fA-F]{64}$/.test(direct)) return direct.toLowerCase();

  const compressed = account?.taproot?.pubkey;
  if (typeof compressed === 'string' && /^[0-9a-fA-F]{66}$/.test(compressed)) {
    return compressed.slice(2).toLowerCase();
  }

  return null;
}

function recoveryNetworkId(networkId?: string): string {
  return (networkId || 'bitcoin').trim().toLowerCase();
}

export function deriveEphemeralRecoveryInternalPubkey(params: {
  networkId?: string;
  userXOnlyPubkey: string;
  ephemeralXOnlyPubkey: string;
}): Buffer {
  const userXOnly = assertXOnly(params.userXOnlyPubkey, 'userXOnlyPubkey');
  const ephemeralXOnly = assertXOnly(params.ephemeralXOnlyPubkey, 'ephemeralXOnlyPubkey');
  const networkId = Buffer.from(recoveryNetworkId(params.networkId), 'utf8');

  for (let counter = 0; counter < 512; counter++) {
    const counterBuffer = Buffer.allocUnsafe(4);
    counterBuffer.writeUInt32BE(counter, 0);
    const candidate = Buffer.from(bitcoin.crypto.sha256(Buffer.concat([
      Buffer.from(RECOVERY_INTERNAL_KEY_TAG, 'utf8'),
      Buffer.from([networkId.length]),
      networkId,
      userXOnly,
      ephemeralXOnly,
      counterBuffer,
    ])));

    // NUMS-style x-only point: reproducible from public data, without a
    // known scalar that would enable key-path spends.
    if (ecc.isXOnlyPoint(candidate)) {
      return candidate;
    }
  }

  throw new Error('Failed to derive deterministic ephemeral recovery internal key');
}

export function buildEphemeralRecoveryOpReturnScript(ephemeralXOnlyPubkey: string): Buffer {
  return Buffer.from(bitcoin.script.compile([
    bitcoin.opcodes.OP_RETURN,
    assertXOnly(ephemeralXOnlyPubkey, 'ephemeralXOnlyPubkey'),
  ]));
}

export function extractEphemeralRecoveryXOnlyPubkeys(tx: TransactionWithVouts): string[] {
  const result: string[] = [];

  for (const vout of tx.vout ?? []) {
    if (!vout.scriptpubkey) continue;
    let chunks: bitcoin.Stack | null = null;
    try {
      chunks = bitcoin.script.decompile(Buffer.from(vout.scriptpubkey, 'hex'));
    } catch {
      chunks = null;
    }
    if (!chunks || chunks[0] !== bitcoin.opcodes.OP_RETURN) continue;

    for (const chunk of chunks.slice(1)) {
      if (typeof chunk === 'number' || chunk.length !== 32) continue;
      const candidate = Buffer.from(chunk);
      if (ecc.isXOnlyPoint(candidate)) {
        result.push(candidate.toString('hex'));
      }
    }
  }

  return [...new Set(result)];
}

export function buildEphemeralRecoveryPayment(params: {
  network: bitcoin.Network;
  userXOnlyPubkey: string;
  ephemeralXOnlyPubkey: string;
  internalPubkey?: Buffer;
}): EphemeralRecoveryPayment {
  const userXOnly = assertXOnly(params.userXOnlyPubkey, 'userXOnlyPubkey');
  const ephemeralXOnly = assertXOnly(params.ephemeralXOnlyPubkey, 'ephemeralXOnlyPubkey');
  const internalPubkey = params.internalPubkey ?? xOnlyPubkey(ECPair.makeRandom({ network: params.network }).publicKey);

  const userLeafScript = Buffer.from(bitcoin.script.compile([userXOnly, bitcoin.opcodes.OP_CHECKSIG]));
  const ephemeralLeafScript = Buffer.from(bitcoin.script.compile([ephemeralXOnly, bitcoin.opcodes.OP_CHECKSIG]));
  const tree = [
    { output: userLeafScript },
    { output: ephemeralLeafScript },
  ] as [{ output: Buffer }, { output: Buffer }];

  const userPayment = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree: tree,
    redeem: { output: userLeafScript, redeemVersion: 0xc0 },
    network: params.network,
  });
  const ephemeralPayment = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree: tree,
    redeem: { output: ephemeralLeafScript, redeemVersion: 0xc0 },
    network: params.network,
  });

  if (!userPayment.address || !userPayment.output || !userPayment.witness?.[1] || !ephemeralPayment.witness?.[1]) {
    throw new Error('Failed to derive ephemeral recovery taproot address');
  }

  return {
    address: userPayment.address,
    outputScriptHex: Buffer.from(userPayment.output).toString('hex'),
    internalPubkey,
    userLeafScript,
    ephemeralLeafScript,
    userControlBlock: Buffer.from(userPayment.witness[1]),
    ephemeralControlBlock: Buffer.from(ephemeralPayment.witness[1]),
  };
}

export function buildDeterministicEphemeralRecoveryPayment(params: {
  network: bitcoin.Network;
  networkId?: string;
  userXOnlyPubkey: string;
  ephemeralXOnlyPubkey: string;
}): EphemeralRecoveryPayment {
  return buildEphemeralRecoveryPayment({
    network: params.network,
    userXOnlyPubkey: params.userXOnlyPubkey,
    ephemeralXOnlyPubkey: params.ephemeralXOnlyPubkey,
    internalPubkey: deriveEphemeralRecoveryInternalPubkey({
      networkId: params.networkId,
      userXOnlyPubkey: params.userXOnlyPubkey,
      ephemeralXOnlyPubkey: params.ephemeralXOnlyPubkey,
    }),
  });
}

export function buildEphemeralRecoveryKey(params: {
  network: bitcoin.Network;
  userXOnlyPubkey: string;
  networkId?: string;
}): EphemeralRecoveryPayment & {
  keyPair: ECPairInterface;
  ephemeralXOnlyPubkey: string;
} {
  const keyPair = ECPair.makeRandom({ network: params.network });
  const ephemeralXOnlyPubkey = xOnlyPubkey(keyPair.publicKey).toString('hex');
  const payment = params.networkId ? buildDeterministicEphemeralRecoveryPayment({
    network: params.network,
    networkId: params.networkId,
    userXOnlyPubkey: params.userXOnlyPubkey,
    ephemeralXOnlyPubkey,
  }) : buildEphemeralRecoveryPayment({
    network: params.network,
    userXOnlyPubkey: params.userXOnlyPubkey,
    ephemeralXOnlyPubkey,
  });
  return { ...payment, keyPair, ephemeralXOnlyPubkey };
}

export function buildSingleEphemeralKey(network: bitcoin.Network): SingleEphemeralKey {
  const keyPair = ECPair.makeRandom({ network });
  const internalPubkey = xOnlyPubkey(keyPair.publicKey);
  const payment = bitcoin.payments.p2tr({ internalPubkey, network });
  if (!payment.address || !payment.output) {
    throw new Error('Failed to derive single-signer ephemeral taproot address');
  }
  return {
    keyPair,
    internalPubkey,
    address: payment.address,
    outputScriptHex: Buffer.from(payment.output).toString('hex'),
  };
}

export function paymentFromRecoveryRecord(
  record: EphemeralRecoveryRecord,
  network: bitcoin.Network,
): EphemeralRecoveryPayment {
  return buildEphemeralRecoveryPayment({
    network,
    userXOnlyPubkey: record.userXOnlyPubkey,
    ephemeralXOnlyPubkey: record.ephemeralXOnlyPubkey,
    internalPubkey: Buffer.from(record.internalPubkey, 'hex'),
  });
}

function storageKey(network: string, parentTxid: string, parentVout = EPHEMERAL_RECOVERY_VOUT): string {
  return `${STORAGE_PREFIX}:${network}:${parentTxid}:${parentVout}`;
}

function rawChildStorageKey(network: string, parentTxid: string, parentVout = EPHEMERAL_RECOVERY_VOUT): string {
  return `${RAW_CHILD_STORAGE_PREFIX}:${network}:${parentTxid}:${parentVout}`;
}

export function saveEphemeralRecoveryRecord(record: EphemeralRecoveryRecord): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    storageKey(record.network, record.parentTxid, record.parentVout),
    JSON.stringify(record),
  );
}

export function getEphemeralRecoveryRecord(
  network: string,
  parentTxid: string,
  parentVout = EPHEMERAL_RECOVERY_VOUT,
): EphemeralRecoveryRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey(network, parentTxid, parentVout));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as EphemeralRecoveryRecord;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRawEphemeralChildTxRecord(record: RawEphemeralChildTxRecord): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    rawChildStorageKey(record.network, record.parentTxid, record.parentVout),
    JSON.stringify(record),
  );
}

export function getRawEphemeralChildTxRecord(
  network: string,
  parentTxid: string,
  parentVout = EPHEMERAL_RECOVERY_VOUT,
): RawEphemeralChildTxRecord | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(rawChildStorageKey(network, parentTxid, parentVout));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RawEphemeralChildTxRecord;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function getSwapTxTestMode(): 0 | 1 | 2 {
  const raw =
    process.env.SWAP_TX_TEST ??
    process.env.NEXT_PUBLIC_SWAP_TX_TEST ??
    (process.env.SWAP_TEST_MODE === '1' || process.env.NEXT_PUBLIC_SWAP_TEST_MODE === '1' ? '1' : '0');
  if (raw === '2') return 2;
  if (raw === '1') return 1;
  return 0;
}
