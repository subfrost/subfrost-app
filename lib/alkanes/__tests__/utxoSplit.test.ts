/**
 * UTXO splitter — splits a multi-asset UTXO into single-asset outputs.
 *
 * Used by the wallet UTXO management UI when a user wants to spend one
 * asset without losing the others on the same UTXO (inscription, rune,
 * alkane). A regression here would silently route alkanes into the BTC
 * change output and burn them at the next non-protostone broadcast.
 *
 * Zero coverage before this file; pure PSBT inspection so cheap to pin.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import { buildUtxoSplitPsbt, type SplitUtxoParams } from '../utxoSplit';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// Deterministic test fixtures — generated once with valid bech32m / bech32
// checksums for the bitcoinjs-lib `address.toOutputScript` round-trip.
function generateAddresses(network: bitcoin.Network) {
  const kp = ECPair.fromPrivateKey(
    Buffer.from('1'.repeat(64), 'hex'),
    { network },
  );
  const internalPubkey = Buffer.from(kp.publicKey).slice(1, 33);
  const taproot = bitcoin.payments.p2tr({ internalPubkey, network });
  const segwit = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(kp.publicKey), network });
  return {
    taproot: taproot.address!,
    segwit: segwit.address!,
    tapInternalKeyHex: internalPubkey.toString('hex'),
  };
}

const MAINNET = generateAddresses(bitcoin.networks.bitcoin);
const FIXTURES = {
  taproot: MAINNET.taproot,
  segwit: MAINNET.segwit,
  tapInternalKeyHex: MAINNET.tapInternalKeyHex,
  txid: 'a'.repeat(64),
};

function basicParams(over: Partial<SplitUtxoParams> = {}): SplitUtxoParams {
  return {
    utxoOutpoint: `${FIXTURES.txid}:0`,
    ownerAddress: FIXTURES.taproot,
    paymentAddress: FIXTURES.segwit,
    tapInternalKeyHex: FIXTURES.tapInternalKeyHex,
    alkaneIds: [{ block: '2', tx: '0', amount: '1000000' }],
    hasInscriptions: false,
    hasRunes: false,
    feeRate: 2,
    networkName: 'mainnet',
    ...over,
  };
}

function mockFetchUtxoValue(value: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ vout: [{ value }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
}

function decodePsbtOutputs(psbtBase64: string): Array<{ script: Buffer; value: number }> {
  const psbt = bitcoin.Psbt.fromBase64(psbtBase64);
  const tx = (psbt as unknown as { __CACHE: { __TX: { outs: Array<{ script: Buffer; value: bigint | number }> } } }).__CACHE?.__TX;
  if (!tx?.outs) return [];
  return tx.outs.map((o) => ({
    script: Buffer.from(o.script),
    value: typeof o.value === 'bigint' ? Number(o.value) : o.value,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildUtxoSplitPsbt — output layout', () => {
  it('alkane-only UTXO with one token: 1 alkane dust + 1 BTC change', async () => {
    mockFetchUtxoValue(100_000);
    const result = await buildUtxoSplitPsbt(basicParams());
    expect(result.outputCount).toBe(2);
    expect(result.outputs.map((o) => o.type)).toEqual(['alkane', 'btc-change']);

    const outs = decodePsbtOutputs(result.psbtBase64);
    expect(outs).toHaveLength(2);
    expect(outs[0].value).toBe(600); // DUST_VALUE — alkane carrier
    expect(outs[1].value).toBeGreaterThan(600); // change must clear dust
    expect(outs[0].value + outs[1].value + result.estimatedFee).toBe(100_000);
  });

  it('multiple alkanes split into one dust output each', async () => {
    mockFetchUtxoValue(500_000);
    const result = await buildUtxoSplitPsbt(basicParams({
      alkaneIds: [
        { block: '2', tx: '0', amount: '1000' },
        { block: '32', tx: '0', amount: '2000' },
        { block: '4', tx: '65498', amount: '3000' },
      ],
    }));
    expect(result.outputCount).toBe(4); // 3 alkanes + 1 change
    expect(result.outputs.filter((o) => o.type === 'alkane')).toHaveLength(3);
    expect(result.outputs.filter((o) => o.type === 'btc-change')).toHaveLength(1);

    const outs = decodePsbtOutputs(result.psbtBase64);
    expect(outs[0].value).toBe(600);
    expect(outs[1].value).toBe(600);
    expect(outs[2].value).toBe(600);
    expect(outs[3].value).toBeGreaterThan(600);
  });

  it('UTXO with inscription + alkane: 1 inscription dust + 1 alkane dust + 1 change (v0 = inscription per FIFO)', async () => {
    mockFetchUtxoValue(100_000);
    const result = await buildUtxoSplitPsbt(basicParams({
      hasInscriptions: true,
    }));
    expect(result.outputCount).toBe(3);
    expect(result.outputs[0].type).toBe('inscription');
    expect(result.outputs[1].type).toBe('alkane');
    expect(result.outputs[2].type).toBe('btc-change');
    // v0 description includes "inscriptions" since inscriptions follow first output.
    expect(result.outputs[0].description).toMatch(/inscriptions/);
  });

  it('UTXO with runes only: v0 is the rune dust', async () => {
    mockFetchUtxoValue(100_000);
    const result = await buildUtxoSplitPsbt(basicParams({
      hasInscriptions: false,
      hasRunes: true,
    }));
    expect(result.outputs[0].type).toBe('rune');
    expect(result.outputs[0].description).toMatch(/runes/);
  });

  it('UTXO with inscription + runes + alkane: v0 carries both inscriptions and runes (FIFO of the dust)', async () => {
    mockFetchUtxoValue(100_000);
    const result = await buildUtxoSplitPsbt(basicParams({
      hasInscriptions: true,
      hasRunes: true,
    }));
    expect(result.outputs[0].type).toBe('inscription');
    // Description must show BOTH so callers know inscriptions + runes share v0.
    expect(result.outputs[0].description).toMatch(/inscriptions \+ runes/);
  });
});

describe('buildUtxoSplitPsbt — fee + change math', () => {
  it('estimated fee scales with output count and fee rate', async () => {
    mockFetchUtxoValue(500_000);
    const oneAlk = await buildUtxoSplitPsbt(basicParams({
      alkaneIds: [{ block: '2', tx: '0', amount: '1' }],
      feeRate: 2,
    }));
    mockFetchUtxoValue(500_000);
    const threeAlk = await buildUtxoSplitPsbt(basicParams({
      alkaneIds: [
        { block: '2', tx: '0', amount: '1' },
        { block: '32', tx: '0', amount: '1' },
        { block: '4', tx: '1', amount: '1' },
      ],
      feeRate: 2,
    }));
    expect(threeAlk.estimatedFee).toBeGreaterThan(oneAlk.estimatedFee);
  });

  it('higher fee rate → higher estimated fee on the same layout', async () => {
    mockFetchUtxoValue(500_000);
    const slow = await buildUtxoSplitPsbt(basicParams({ feeRate: 1 }));
    mockFetchUtxoValue(500_000);
    const fast = await buildUtxoSplitPsbt(basicParams({ feeRate: 20 }));
    expect(fast.estimatedFee).toBeGreaterThan(slow.estimatedFee);
  });

  it('change routes to paymentAddress when provided, owner otherwise', async () => {
    mockFetchUtxoValue(100_000);
    const withPay = await buildUtxoSplitPsbt(basicParams());
    const psbtPay = bitcoin.Psbt.fromBase64(withPay.psbtBase64);
    const tx = (psbtPay as unknown as { __CACHE: { __TX: { outs: Array<{ script: Buffer }> } } }).__CACHE.__TX;
    const changeOut = tx.outs[tx.outs.length - 1];
    const segwitScript = bitcoin.address.toOutputScript(FIXTURES.segwit, bitcoin.networks.bitcoin);
    expect(Buffer.from(changeOut.script).equals(segwitScript)).toBe(true);

    // Owner-only case: change goes to owner.
    mockFetchUtxoValue(100_000);
    const noPay = await buildUtxoSplitPsbt(basicParams({ paymentAddress: undefined }));
    const psbtOwner = bitcoin.Psbt.fromBase64(noPay.psbtBase64);
    const txOwn = (psbtOwner as unknown as { __CACHE: { __TX: { outs: Array<{ script: Buffer }> } } }).__CACHE.__TX;
    const ownerChange = txOwn.outs[txOwn.outs.length - 1];
    const taprootScript = bitcoin.address.toOutputScript(FIXTURES.taproot, bitcoin.networks.bitcoin);
    expect(Buffer.from(ownerChange.script).equals(taprootScript)).toBe(true);
  });
});

describe('buildUtxoSplitPsbt — throws on bad inputs', () => {
  it('throws when esplora returns null (no UTXO found)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not-ok', { status: 404 })),
    );
    await expect(buildUtxoSplitPsbt(basicParams())).rejects.toThrow(/Could not fetch UTXO value/i);
  });

  it('throws when the UTXO is too small to cover dust + fee', async () => {
    mockFetchUtxoValue(700); // 1 alkane dust = 600, then fee + change need more
    await expect(buildUtxoSplitPsbt(basicParams())).rejects.toThrow(/Insufficient UTXO value/i);
  });
});

describe('buildUtxoSplitPsbt — network selection', () => {
  it('uses regtest when networkName is "subfrost-regtest"', async () => {
    mockFetchUtxoValue(100_000);
    // Owner address must be valid for the selected network. Generate one.
    const ECPair = (await import('ecpair')).ECPairFactory(ecc);
    const kp = ECPair.makeRandom({ network: bitcoin.networks.regtest });
    const internalPubkey = Buffer.from(kp.publicKey).slice(1, 33);
    const tap = bitcoin.payments.p2tr({ internalPubkey, network: bitcoin.networks.regtest });

    const result = await buildUtxoSplitPsbt(basicParams({
      networkName: 'subfrost-regtest',
      ownerAddress: tap.address!,
      paymentAddress: undefined,
      tapInternalKeyHex: internalPubkey.toString('hex'),
    }));
    expect(result.outputCount).toBe(2);
  });

  it('uses testnet for "signet" (signet shares testnet params here)', async () => {
    mockFetchUtxoValue(100_000);
    const ECPair = (await import('ecpair')).ECPairFactory(ecc);
    const kp = ECPair.makeRandom({ network: bitcoin.networks.testnet });
    const internalPubkey = Buffer.from(kp.publicKey).slice(1, 33);
    const tap = bitcoin.payments.p2tr({ internalPubkey, network: bitcoin.networks.testnet });

    const result = await buildUtxoSplitPsbt(basicParams({
      networkName: 'signet',
      ownerAddress: tap.address!,
      paymentAddress: undefined,
      tapInternalKeyHex: internalPubkey.toString('hex'),
    }));
    expect(result.outputCount).toBe(2);
  });
});
