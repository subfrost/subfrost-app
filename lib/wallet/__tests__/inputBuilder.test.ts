/**
 * Unit tests for `lib/wallet/inputBuilder.ts`.
 *
 * Pattern mirrors `hooks/__tests__/mutations/unisat-single-address-bugs.test.ts`:
 * vitest + bitcoinjs-lib + tiny-secp256k1, ECC initialized once at module load.
 *
 * Per CLAUDE.md cryptographic-integrity rule: NEVER hardcode keys/addresses.
 * Each test case generates a fresh ECPair and derives all four address types
 * (P2PKH, P2SH-P2WPKH, P2WPKH, P2TR) from the same private key. The synthetic
 * prev-tx for P2PKH `nonWitnessUtxo` cases is built up from a `Transaction`
 * with a deterministic-but-fresh shape per test.
 */

import { describe, it, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';

import {
  AddressType,
  addInputDynamic,
  getAddressType,
  redeemTypeFromOutput,
  type SubfrostUtxo,
} from '../inputBuilder';

// ECC must be initialized at module-load (not in beforeAll) because the
// `describe` blocks below call `makeAddressFixture` at suite-registration
// time, before any `beforeAll` runs.
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface AddressFixture {
  pubkeyHex: string;          // 66-char compressed
  xOnlyHex: string;           // 64-char x-only
  p2pkh: { address: string; output: Uint8Array };
  p2wpkh: { address: string; output: Uint8Array };
  p2shP2wpkh: { address: string; output: Uint8Array; redeem: Uint8Array };
  p2tr: { address: string; output: Uint8Array };
}

function makeAddressFixture(network: bitcoin.Network): AddressFixture {
  const keyPair = ECPair.makeRandom({ network });
  const pubkey = Buffer.from(keyPair.publicKey);

  const p2pkh = bitcoin.payments.p2pkh({ pubkey, network });
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network });
  const p2shP2wpkh = bitcoin.payments.p2sh({ redeem: p2wpkh, network });
  const xOnly = pubkey.subarray(1, 33); // strip parity for P2TR
  const p2tr = bitcoin.payments.p2tr({ internalPubkey: xOnly, network });

  return {
    pubkeyHex: pubkey.toString('hex'),
    xOnlyHex: xOnly.toString('hex'),
    p2pkh: {
      address: p2pkh.address!,
      output: new Uint8Array(p2pkh.output!),
    },
    p2wpkh: {
      address: p2wpkh.address!,
      output: new Uint8Array(p2wpkh.output!),
    },
    p2shP2wpkh: {
      address: p2shP2wpkh.address!,
      output: new Uint8Array(p2shP2wpkh.output!),
      redeem: new Uint8Array(p2wpkh.output!),
    },
    p2tr: {
      address: p2tr.address!,
      output: new Uint8Array(p2tr.output!),
    },
  };
}

/**
 * Build a syntactically valid prev-tx hex with one output paying
 * `outputScript` for `valueSats`. Used to construct `nonWitnessUtxo`
 * data for P2PKH input tests.
 */
function makePrevTxHex(outputScript: Uint8Array, valueSats: number): string {
  const tx = new bitcoin.Transaction();
  // One coinbase-shaped input — the bytes don't matter, bitcoinjs only
  // hashes the whole tx for txid; consumers re-validate via vout index.
  tx.addInput(Buffer.alloc(32), 0xffffffff, 0xffffffff, Buffer.alloc(0));
  tx.addOutput(Buffer.from(outputScript), BigInt(valueSats));
  return tx.toHex();
}

function utxoFor(opts: {
  output: Uint8Array;
  address?: string;
  value?: number;
  prevTxHex?: string;
  txid?: string;
  vout?: number;
}): SubfrostUtxo {
  return {
    txid: opts.txid ?? 'a'.repeat(64),
    vout: opts.vout ?? 0,
    value: opts.value ?? 100_000,
    scriptPubKeyHex: Buffer.from(opts.output).toString('hex'),
    address: opts.address ?? '',
    prevTxHex: opts.prevTxHex,
  };
}

// ---------------------------------------------------------------------------
// (a) getAddressType — regtest
// ---------------------------------------------------------------------------

describe('getAddressType — regtest', () => {
  const network = bitcoin.networks.regtest;
  const fx = makeAddressFixture(network);

  it('detects bcrt1p… as P2TR', () => {
    expect(fx.p2tr.address.startsWith('bcrt1p')).toBe(true);
    expect(getAddressType(fx.p2tr.address, network)).toBe(AddressType.P2TR);
  });

  it('detects bcrt1q… as P2WPKH', () => {
    expect(fx.p2wpkh.address.startsWith('bcrt1q')).toBe(true);
    expect(getAddressType(fx.p2wpkh.address, network)).toBe(AddressType.P2WPKH);
  });

  it('detects m…/n… as P2PKH', () => {
    expect(fx.p2pkh.address.match(/^[mn]/)).toBeTruthy();
    expect(getAddressType(fx.p2pkh.address, network)).toBe(AddressType.P2PKH);
  });

  it('detects 2… as P2SH_P2WPKH', () => {
    expect(fx.p2shP2wpkh.address.startsWith('2')).toBe(true);
    expect(getAddressType(fx.p2shP2wpkh.address, network)).toBe(
      AddressType.P2SH_P2WPKH,
    );
  });

  it('returns null for junk', () => {
    // Note: a string starting with 'm'/'n' on regtest *would* be classified
    // as P2PKH by leading-char heuristic (this helper does prefix-only
    // classification, not full validation — bitcoin.address.toOutputScript
    // is the validation layer). Use clearly-invalid leading chars here.
    expect(getAddressType('!not-an-address', network)).toBeNull();
    expect(getAddressType('zzz-also-not', network)).toBeNull();
    expect(getAddressType('', network)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (b) getAddressType — mainnet
// ---------------------------------------------------------------------------

describe('getAddressType — mainnet', () => {
  const network = bitcoin.networks.bitcoin;
  const fx = makeAddressFixture(network);

  it('detects bc1p… as P2TR', () => {
    expect(fx.p2tr.address.startsWith('bc1p')).toBe(true);
    expect(getAddressType(fx.p2tr.address, network)).toBe(AddressType.P2TR);
  });

  it('detects bc1q… as P2WPKH', () => {
    expect(fx.p2wpkh.address.startsWith('bc1q')).toBe(true);
    expect(getAddressType(fx.p2wpkh.address, network)).toBe(AddressType.P2WPKH);
  });

  it('detects 1… as P2PKH', () => {
    expect(fx.p2pkh.address.startsWith('1')).toBe(true);
    expect(getAddressType(fx.p2pkh.address, network)).toBe(AddressType.P2PKH);
  });

  it('detects 3… as P2SH_P2WPKH', () => {
    expect(fx.p2shP2wpkh.address.startsWith('3')).toBe(true);
    expect(getAddressType(fx.p2shP2wpkh.address, network)).toBe(
      AddressType.P2SH_P2WPKH,
    );
  });

  it('rejects testnet addresses on mainnet network', () => {
    const tnetFx = makeAddressFixture(bitcoin.networks.testnet);
    expect(getAddressType(tnetFx.p2tr.address, network)).toBeNull();
    expect(getAddressType(tnetFx.p2wpkh.address, network)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) redeemTypeFromOutput — byte patterns
// ---------------------------------------------------------------------------

describe('redeemTypeFromOutput', () => {
  const network = bitcoin.networks.regtest;
  const fx = makeAddressFixture(network);

  it('detects P2TR scriptPubKey', () => {
    expect(redeemTypeFromOutput(fx.p2tr.output, network)).toBe(AddressType.P2TR);
  });

  it('detects P2WPKH scriptPubKey', () => {
    expect(redeemTypeFromOutput(fx.p2wpkh.output, network)).toBe(
      AddressType.P2WPKH,
    );
  });

  it('detects P2PKH scriptPubKey', () => {
    expect(redeemTypeFromOutput(fx.p2pkh.output, network)).toBe(AddressType.P2PKH);
  });

  it('detects P2SH scriptPubKey as P2SH_P2WPKH', () => {
    expect(redeemTypeFromOutput(fx.p2shP2wpkh.output, network)).toBe(
      AddressType.P2SH_P2WPKH,
    );
  });

  it('returns null for OP_RETURN', () => {
    const opReturn = bitcoin.payments.embed({ data: [Buffer.from('hello')] });
    expect(redeemTypeFromOutput(new Uint8Array(opReturn.output!), network)).toBeNull();
  });

  it('returns null for P2WSH (must NOT collide with P2TR)', () => {
    // P2WSH is OP_0 + push 32 bytes — same length as P2TR (34 bytes)
    // but discriminated by witness version byte (0x00 vs 0x51).
    const p2wshScript = new Uint8Array(34);
    p2wshScript[0] = 0x00;
    p2wshScript[1] = 0x20;
    // bytes 2..34 left as zeros — content doesn't matter for type detection
    expect(redeemTypeFromOutput(p2wshScript, network)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (d) addInputDynamic — P2WPKH happy path
// ---------------------------------------------------------------------------

describe('addInputDynamic — P2WPKH', () => {
  const network = bitcoin.networks.regtest;

  it('builds a witnessUtxo-only input', () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });
    addInputDynamic(psbt, network, utxoFor({ output: fx.p2wpkh.output }), {});

    expect(psbt.data.inputs).toHaveLength(1);
    const input = psbt.data.inputs[0];
    expect(input.witnessUtxo).toBeDefined();
    expect(Buffer.from(input.witnessUtxo!.script).equals(Buffer.from(fx.p2wpkh.output)))
      .toBe(true);
    expect(input.witnessUtxo!.value).toBe(100_000n);
    expect(input.tapInternalKey).toBeUndefined();
    expect(input.redeemScript).toBeUndefined();
    expect(input.nonWitnessUtxo).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (e) addInputDynamic — P2PKH happy path
// ---------------------------------------------------------------------------

describe('addInputDynamic — P2PKH', () => {
  const network = bitcoin.networks.regtest;

  it('builds a nonWitnessUtxo-only input when prevTxHex is supplied', () => {
    const fx = makeAddressFixture(network);
    const value = 100_000;
    const prevTxHex = makePrevTxHex(fx.p2pkh.output, value);
    const prevTx = bitcoin.Transaction.fromHex(prevTxHex);
    const txid = prevTx.getId();

    const psbt = new bitcoin.Psbt({ network });
    addInputDynamic(
      psbt,
      network,
      utxoFor({
        output: fx.p2pkh.output,
        value,
        prevTxHex,
        txid,
        vout: 0,
      }),
      {},
    );

    expect(psbt.data.inputs).toHaveLength(1);
    const input = psbt.data.inputs[0];
    expect(input.nonWitnessUtxo).toBeDefined();
    expect(input.witnessUtxo).toBeUndefined();
    expect(input.tapInternalKey).toBeUndefined();
    expect(input.redeemScript).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (f) addInputDynamic — P2SH-P2WPKH happy path + sanity check
// ---------------------------------------------------------------------------

describe('addInputDynamic — P2SH-P2WPKH', () => {
  const network = bitcoin.networks.regtest;

  it('builds witnessUtxo (outer P2SH) + redeemScript (inner P2WPKH)', () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });

    addInputDynamic(
      psbt,
      network,
      utxoFor({ output: fx.p2shP2wpkh.output }),
      { nativeSegwitPubkeyHex: fx.pubkeyHex },
    );

    expect(psbt.data.inputs).toHaveLength(1);
    const input = psbt.data.inputs[0];
    expect(input.witnessUtxo).toBeDefined();
    expect(
      Buffer.from(input.witnessUtxo!.script).equals(Buffer.from(fx.p2shP2wpkh.output)),
    ).toBe(true);
    expect(input.redeemScript).toBeDefined();
    expect(
      Buffer.from(input.redeemScript!).equals(Buffer.from(fx.p2shP2wpkh.redeem)),
    ).toBe(true);
    expect(input.tapInternalKey).toBeUndefined();
    expect(input.nonWitnessUtxo).toBeUndefined();
  });

  it('throws when nativeSegwitPubkeyHex is for a different keypair', () => {
    const correct = makeAddressFixture(network);
    const wrongPubkey = makeAddressFixture(network).pubkeyHex;
    const psbt = new bitcoin.Psbt({ network });

    expect(() =>
      addInputDynamic(
        psbt,
        network,
        utxoFor({ output: correct.p2shP2wpkh.output }),
        { nativeSegwitPubkeyHex: wrongPubkey },
      ),
    ).toThrow(/does not match UTXO scriptPubKey/);
  });
});

// ---------------------------------------------------------------------------
// (g) addInputDynamic — P2TR happy path: tapInternalKey === user x-only
//                                          (NOT script[2..34])
// ---------------------------------------------------------------------------

describe('addInputDynamic — P2TR', () => {
  const network = bitcoin.networks.regtest;

  it("uses the user's untweaked x-only pubkey for tapInternalKey, NOT the tweaked output key", () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });

    addInputDynamic(
      psbt,
      network,
      utxoFor({ output: fx.p2tr.output }),
      { taprootPubKeyXOnly: fx.xOnlyHex },
    );

    const input = psbt.data.inputs[0];
    expect(input.tapInternalKey).toBeDefined();
    const tapHex = Buffer.from(input.tapInternalKey!).toString('hex');

    // The contract: tapInternalKey === user's untweaked x-only pubkey.
    expect(tapHex).toBe(fx.xOnlyHex);

    // And: tapInternalKey is NOT script.subarray(2, 34) (the tweaked output key).
    // This is the bitapeslabs bug we explicitly avoid — the two values
    // must differ for any well-formed P2TR address.
    const scriptOutputKey = Buffer.from(fx.p2tr.output.subarray(2, 34)).toString('hex');
    expect(tapHex).not.toBe(scriptOutputKey);

    expect(input.witnessUtxo).toBeDefined();
    expect(input.redeemScript).toBeUndefined();
    expect(input.nonWitnessUtxo).toBeUndefined();
  });

  it('accepts a 66-char compressed pubkey and normalizes via toXOnlyPubKeyHex', () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });

    addInputDynamic(
      psbt,
      network,
      utxoFor({ output: fx.p2tr.output }),
      { taprootPubKeyXOnly: fx.pubkeyHex }, // 66-char form
    );

    const tapHex = Buffer.from(psbt.data.inputs[0].tapInternalKey!).toString('hex');
    expect(tapHex).toBe(fx.xOnlyHex);
  });
});

// ---------------------------------------------------------------------------
// (h) P2TR without taprootPubKeyXOnly → throws
// ---------------------------------------------------------------------------

describe('addInputDynamic — error paths', () => {
  const network = bitcoin.networks.regtest;

  it('(h) P2TR without taprootPubKeyXOnly throws', () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });
    expect(() =>
      addInputDynamic(psbt, network, utxoFor({ output: fx.p2tr.output }), {}),
    ).toThrow(/P2TR input requires taprootPubKeyXOnly/);
  });

  it('(i) P2PKH without prevTxHex throws', () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });
    expect(() =>
      addInputDynamic(psbt, network, utxoFor({ output: fx.p2pkh.output }), {}),
    ).toThrow(/P2PKH input requires prevTxHex/);
  });

  it('(j) P2SH-P2WPKH without nativeSegwitPubkeyHex throws', () => {
    const fx = makeAddressFixture(network);
    const psbt = new bitcoin.Psbt({ network });
    expect(() =>
      addInputDynamic(psbt, network, utxoFor({ output: fx.p2shP2wpkh.output }), {}),
    ).toThrow(/P2SH-P2WPKH input requires nativeSegwitPubkeyHex/);
  });

  it('(k) unknown script + unknown address throws', () => {
    const psbt = new bitcoin.Psbt({ network });
    // 23-byte non-P2SH script (no OP_HASH160 prefix) — fails redeem detection.
    const garbage = new Uint8Array(23).fill(0x42);
    expect(() =>
      addInputDynamic(
        psbt,
        network,
        {
          txid: 'b'.repeat(64),
          vout: 0,
          value: 1000,
          scriptPubKeyHex: Buffer.from(garbage).toString('hex'),
          address: 'foo', // not a valid prefix on any network
        },
        {},
      ),
    ).toThrow(/unsupported address type/);
  });
});
