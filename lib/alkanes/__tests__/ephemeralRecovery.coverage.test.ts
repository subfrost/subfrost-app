/**
 * Ephemeral recovery — full primitive coverage.
 *
 * The existing `ephemeralRecovery.test.ts` covers only one slice
 * (multisig descriptor rebuild). This file pins the rest of the
 * surface — every primitive the production swap path relies on for
 * either the package broadcast OR the partial-broadcast recovery
 * failsafe.
 *
 * Failure to maintain these invariants caused real on-chain fund loss
 * historically:
 *   - A stale `SWAP_TX_TEST=1` in the deploy env stranded user BTC on
 *     mainnet by broadcasting wrap-only. The mainnet hard-guard in
 *     `getSwapTxTestMode` is the regression test for that incident —
 *     covered here.
 *   - A version mismatch on the saved recovery record silently
 *     dropped a user's recovery descriptor, meaning Settings →
 *     Ephemeral Recovery couldn't sweep the stranded BTC. Storage
 *     round-trip + version-validate is covered here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import {
  EPHEMERAL_RECOVERY_VOUT,
  buildEphemeralRecoveryKey,
  buildEphemeralRecoveryOpReturnScript,
  buildSingleEphemeralKey,
  deriveEphemeralRecoveryInternalPubkey,
  deriveXOnlyFromAccount,
  extractEphemeralRecoveryXOnlyPubkeys,
  getEphemeralRecoveryRecord,
  getRawEphemeralChildTxRecord,
  getSwapTxTestMode,
  paymentFromRecoveryRecord,
  saveEphemeralRecoveryRecord,
  saveRawEphemeralChildTxRecord,
  xOnlyPubkey,
  type EphemeralRecoveryRecord,
  type RawEphemeralChildTxRecord,
} from '../ephemeralRecovery';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// ---------------------------------------------------------------------------
// in-memory localStorage shim — the recovery storage helpers gate on
// `typeof window === 'undefined'` so we set up a window.localStorage that
// stays scoped to this test file.
// ---------------------------------------------------------------------------

function setupLocalStorage(): { reset: () => void } {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  vi.stubGlobal('window', { localStorage });
  return { reset: () => store.clear() };
}

function makeRandomXOnly(network: bitcoin.Network = bitcoin.networks.bitcoin): string {
  return xOnlyPubkey(ECPair.makeRandom({ network }).publicKey).toString('hex');
}

// ===========================================================================

describe('getSwapTxTestMode — mainnet hard-guard', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('forces 0 on mainnet regardless of SWAP_TX_TEST value', () => {
    // The 2026-03+ production incident: a stale SWAP_TX_TEST=1 in the
    // mainnet deploy env stranded user BTC by broadcasting wrap-only.
    // The hard-guard means even if the env var leaks back in, mainnet
    // stays at full atomic broadcast.
    for (const env of ['mainnet']) {
      process.env.NEXT_PUBLIC_NETWORK = env;
      for (const v of ['1', '2', '']) {
        process.env.SWAP_TX_TEST = v;
        expect(
          getSwapTxTestMode(),
          `mainnet hard-guard must clamp SWAP_TX_TEST="${v}" → 0`,
        ).toBe(0);
      }
    }
  });

  it('honors SWAP_TX_TEST=1 on non-mainnet', () => {
    process.env.NEXT_PUBLIC_NETWORK = 'subfrost-regtest';
    process.env.SWAP_TX_TEST = '1';
    expect(getSwapTxTestMode()).toBe(1);
  });

  it('honors SWAP_TX_TEST=2 on non-mainnet (raw-recovery mode)', () => {
    process.env.NEXT_PUBLIC_NETWORK = 'subfrost-regtest';
    process.env.SWAP_TX_TEST = '2';
    expect(getSwapTxTestMode()).toBe(2);
  });

  it('also reads NEXT_PUBLIC_SWAP_TX_TEST on non-mainnet', () => {
    process.env.NEXT_PUBLIC_NETWORK = 'subfrost-regtest';
    delete process.env.SWAP_TX_TEST;
    process.env.NEXT_PUBLIC_SWAP_TX_TEST = '2';
    expect(getSwapTxTestMode()).toBe(2);
  });

  it('honors legacy SWAP_TEST_MODE=1 fallback', () => {
    process.env.NEXT_PUBLIC_NETWORK = 'subfrost-regtest';
    delete process.env.SWAP_TX_TEST;
    delete process.env.NEXT_PUBLIC_SWAP_TX_TEST;
    process.env.SWAP_TEST_MODE = '1';
    expect(getSwapTxTestMode()).toBe(1);
  });

  it('defaults to 0 when nothing is set', () => {
    delete process.env.NEXT_PUBLIC_NETWORK;
    delete process.env.NETWORK;
    delete process.env.SWAP_TX_TEST;
    delete process.env.NEXT_PUBLIC_SWAP_TX_TEST;
    delete process.env.SWAP_TEST_MODE;
    delete process.env.NEXT_PUBLIC_SWAP_TEST_MODE;
    expect(getSwapTxTestMode()).toBe(0);
  });

  it('rejects bogus values as 0', () => {
    process.env.NEXT_PUBLIC_NETWORK = 'subfrost-regtest';
    process.env.SWAP_TX_TEST = 'yes';
    expect(getSwapTxTestMode()).toBe(0);
    process.env.SWAP_TX_TEST = '99';
    expect(getSwapTxTestMode()).toBe(0);
  });
});

// ===========================================================================

describe('EphemeralRecoveryRecord storage round-trip', () => {
  let lsState: ReturnType<typeof setupLocalStorage>;
  beforeEach(() => { lsState = setupLocalStorage(); });
  afterEach(() => {
    lsState.reset();
    vi.unstubAllGlobals();
  });

  function makeRecord(over: Partial<EphemeralRecoveryRecord> = {}): EphemeralRecoveryRecord {
    return {
      version: 1,
      createdAt: 1_700_000_000_000,
      network: 'mainnet',
      parentTxid: 'a'.repeat(64),
      parentVout: EPHEMERAL_RECOVERY_VOUT,
      userXOnlyPubkey: makeRandomXOnly(),
      ephemeralXOnlyPubkey: makeRandomXOnly(),
      internalPubkey: makeRandomXOnly(),
      address: 'bc1pxyz',
      outputScriptHex: '5120' + 'aa'.repeat(32),
      outputValue: 12_345,
      userAddress: 'bc1pxyz_user',
      ...over,
    };
  }

  it('save then get returns the same record', () => {
    const record = makeRecord();
    saveEphemeralRecoveryRecord(record);
    const got = getEphemeralRecoveryRecord(record.network, record.parentTxid);
    expect(got).toEqual(record);
  });

  it('returns null when no record exists', () => {
    expect(getEphemeralRecoveryRecord('mainnet', 'b'.repeat(64))).toBeNull();
  });

  it('rejects records with mismatched version (catches old-schema rows)', () => {
    const record = makeRecord({ version: 99 as unknown as 1 });
    saveEphemeralRecoveryRecord(record);
    expect(getEphemeralRecoveryRecord(record.network, record.parentTxid)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    window.localStorage.setItem(
      `subfrost:ephemeral-recovery:mainnet:${'c'.repeat(64)}:0`,
      'not-json',
    );
    expect(getEphemeralRecoveryRecord('mainnet', 'c'.repeat(64))).toBeNull();
  });

  it('storage keys are namespaced per (network, parentTxid, parentVout)', () => {
    const r1 = makeRecord({ network: 'mainnet', parentTxid: 'a'.repeat(64) });
    const r2 = makeRecord({ network: 'subfrost-regtest', parentTxid: 'a'.repeat(64) });
    const r3 = makeRecord({ network: 'mainnet', parentTxid: 'b'.repeat(64) });
    saveEphemeralRecoveryRecord(r1);
    saveEphemeralRecoveryRecord(r2);
    saveEphemeralRecoveryRecord(r3);
    expect(getEphemeralRecoveryRecord(r1.network, r1.parentTxid)?.network).toBe('mainnet');
    expect(getEphemeralRecoveryRecord(r2.network, r2.parentTxid)?.network).toBe('subfrost-regtest');
    expect(getEphemeralRecoveryRecord(r3.network, r3.parentTxid)?.parentTxid).toBe('b'.repeat(64));
  });

  it('save is a no-op when window is undefined (SSR safe) — does not throw', () => {
    // Pin: server-side renders must not crash on these helpers. vitest's
    // `vi.unstubAllGlobals()` restores the pre-stubbed (undefined) window,
    // exercising the SSR guard. We only assert non-throw — checking the
    // get() path post-unstub would race against vitest's restore order.
    vi.unstubAllGlobals();
    expect(() => saveEphemeralRecoveryRecord(makeRecord())).not.toThrow();
    expect(() => saveRawEphemeralChildTxRecord({
      version: 1, createdAt: 0, network: 'mainnet', parentTxid: 'a'.repeat(64),
      parentVout: 0, userAddress: 'u', address: 'a',
      outputScriptHex: '5120' + 'aa'.repeat(32), outputValue: 1,
      txHex: 'deadbeef', txid: 'd'.repeat(64),
    })).not.toThrow();
  });
});

// ===========================================================================

describe('RawEphemeralChildTxRecord storage round-trip', () => {
  let lsState: ReturnType<typeof setupLocalStorage>;
  beforeEach(() => { lsState = setupLocalStorage(); });
  afterEach(() => {
    lsState.reset();
    vi.unstubAllGlobals();
  });

  function makeRawRecord(over: Partial<RawEphemeralChildTxRecord> = {}): RawEphemeralChildTxRecord {
    return {
      version: 1,
      createdAt: 1_700_000_000_000,
      network: 'mainnet',
      parentTxid: 'a'.repeat(64),
      parentVout: EPHEMERAL_RECOVERY_VOUT,
      userAddress: 'bc1pxyz_user',
      address: 'bc1pxyz_ephem',
      outputScriptHex: '5120' + 'aa'.repeat(32),
      outputValue: 1_000,
      txHex: 'deadbeef',
      txid: 'd'.repeat(64),
      ...over,
    };
  }

  it('save then get returns the same record', () => {
    const record = makeRawRecord();
    saveRawEphemeralChildTxRecord(record);
    expect(getRawEphemeralChildTxRecord(record.network, record.parentTxid)).toEqual(record);
  });

  it('returns null on version mismatch (catches old-schema rows)', () => {
    saveRawEphemeralChildTxRecord(makeRawRecord({ version: 0 as unknown as 1 }));
    expect(getRawEphemeralChildTxRecord('mainnet', 'a'.repeat(64))).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    window.localStorage.setItem(
      `subfrost:ephemeral-raw-child:mainnet:${'a'.repeat(64)}:0`,
      'not-json',
    );
    expect(getRawEphemeralChildTxRecord('mainnet', 'a'.repeat(64))).toBeNull();
  });

  it('raw-child and recovery keys are distinct (different prefixes)', () => {
    // Both surfaces use the same (network, parentTxid, parentVout) tuple
    // but persist to different keys — otherwise a successful taproot-
    // recovery would overwrite a stashed raw-child record (or vice versa)
    // and the user would lose the alternate failsafe.
    const txid = 'a'.repeat(64);
    saveEphemeralRecoveryRecord({
      version: 1, createdAt: 0, network: 'mainnet', parentTxid: txid,
      parentVout: 0, userXOnlyPubkey: makeRandomXOnly(),
      ephemeralXOnlyPubkey: makeRandomXOnly(), internalPubkey: makeRandomXOnly(),
      address: 'a', outputScriptHex: '5120' + 'aa'.repeat(32), outputValue: 1,
      userAddress: 'u',
    });
    saveRawEphemeralChildTxRecord(makeRawRecord({ parentTxid: txid }));
    expect(getEphemeralRecoveryRecord('mainnet', txid)).not.toBeNull();
    expect(getRawEphemeralChildTxRecord('mainnet', txid)).not.toBeNull();
  });
});

// ===========================================================================

describe('buildSingleEphemeralKey — raw-recovery mode', () => {
  it('produces a fresh keypair + valid taproot P2TR address', () => {
    const a = buildSingleEphemeralKey(bitcoin.networks.bitcoin);
    expect(a.keyPair.privateKey).toBeTruthy();
    expect(a.internalPubkey.length).toBe(32);
    expect(a.address.startsWith('bc1p')).toBe(true);
    expect(a.outputScriptHex.startsWith('5120')).toBe(true);
    expect(a.outputScriptHex.length).toBe(68);

    // Two calls produce distinct keys (no reuse).
    const b = buildSingleEphemeralKey(bitcoin.networks.bitcoin);
    expect(b.address).not.toBe(a.address);
    expect(b.outputScriptHex).not.toBe(a.outputScriptHex);
  });

  it('emits regtest-prefixed addresses on regtest', () => {
    const r = buildSingleEphemeralKey(bitcoin.networks.regtest);
    expect(r.address.startsWith('bcrt1p')).toBe(true);
  });
});

// ===========================================================================

describe('paymentFromRecoveryRecord — rebuild from stored record', () => {
  it('reconstructs the recovery payment exactly from a saved record', () => {
    // Build a fresh recovery key, save its record, then rebuild — the
    // resulting EphemeralRecoveryPayment must match field-for-field on
    // the script/address surface that matters for spending.
    const userXOnlyPubkey = makeRandomXOnly();
    const built = buildEphemeralRecoveryKey({
      network: bitcoin.networks.bitcoin,
      networkId: 'mainnet',
      userXOnlyPubkey,
    });
    const record: EphemeralRecoveryRecord = {
      version: 1,
      createdAt: Date.now(),
      network: 'mainnet',
      parentTxid: 'a'.repeat(64),
      parentVout: EPHEMERAL_RECOVERY_VOUT,
      userXOnlyPubkey,
      ephemeralXOnlyPubkey: built.ephemeralXOnlyPubkey,
      internalPubkey: built.internalPubkey.toString('hex'),
      address: built.address,
      outputScriptHex: built.outputScriptHex,
      outputValue: 1_000,
      userAddress: 'bc1pxyz',
    };
    const rebuilt = paymentFromRecoveryRecord(record, bitcoin.networks.bitcoin);
    expect(rebuilt.address).toBe(built.address);
    expect(rebuilt.outputScriptHex).toBe(built.outputScriptHex);
    expect(rebuilt.ephemeralLeafScript.toString('hex')).toBe(built.ephemeralLeafScript.toString('hex'));
  });
});

// ===========================================================================

describe('OP_RETURN recovery descriptor — encode/decode round-trip', () => {
  it('extracts the x-only pubkey from a freshly-built descriptor', () => {
    const ephemeralXOnly = makeRandomXOnly();
    const descriptor = buildEphemeralRecoveryOpReturnScript(ephemeralXOnly);
    const extracted = extractEphemeralRecoveryXOnlyPubkeys({
      vout: [{ scriptpubkey: descriptor.toString('hex') }],
    });
    expect(extracted).toEqual([ephemeralXOnly]);
  });

  it('returns [] on a tx with no OP_RETURN containing the marker', () => {
    expect(
      extractEphemeralRecoveryXOnlyPubkeys({
        vout: [
          { scriptpubkey: '5120' + 'aa'.repeat(32) }, // plain P2TR, not OP_RETURN
          { scriptpubkey: '0014' + 'bb'.repeat(20) }, // plain P2WPKH
        ],
      }),
    ).toEqual([]);
  });

  it('tolerates malformed OP_RETURN scripts without throwing', () => {
    expect(() =>
      extractEphemeralRecoveryXOnlyPubkeys({
        vout: [
          { scriptpubkey: '6a' }, // bare OP_RETURN, no push
          { scriptpubkey: '6a01ff' }, // OP_RETURN with a single garbage byte
          { scriptpubkey: 'not-hex' as unknown as string },
        ],
      }),
    ).not.toThrow();
  });

  it('returns multiple x-onlys when a tx carries multiple descriptors', () => {
    const a = makeRandomXOnly();
    const b = makeRandomXOnly();
    const extracted = extractEphemeralRecoveryXOnlyPubkeys({
      vout: [
        { scriptpubkey: buildEphemeralRecoveryOpReturnScript(a).toString('hex') },
        { scriptpubkey: '5120' + 'cc'.repeat(32) },
        { scriptpubkey: buildEphemeralRecoveryOpReturnScript(b).toString('hex') },
      ],
    });
    expect(extracted).toEqual([a, b]);
  });
});

// ===========================================================================

describe('deriveXOnlyFromAccount', () => {
  it('returns null for null / undefined account', () => {
    expect(deriveXOnlyFromAccount(null)).toBeNull();
    expect(deriveXOnlyFromAccount(undefined)).toBeNull();
  });

  it('returns null when there is no taproot info', () => {
    expect(deriveXOnlyFromAccount({} as any)).toBeNull();
    expect(deriveXOnlyFromAccount({ taproot: {} as any })).toBeNull();
  });

  it('extracts a stored x-only string from taproot.pubKeyXOnly', () => {
    const x = makeRandomXOnly();
    expect(deriveXOnlyFromAccount({ taproot: { pubKeyXOnly: x } } as any)).toBe(x);
  });

  it('drops the prefix byte from a 33-byte compressed pubkey (account.taproot.pubkey hex form)', () => {
    const compressed = ECPair.makeRandom({ network: bitcoin.networks.bitcoin }).publicKey;
    const compressedHex = Buffer.from(compressed).toString('hex'); // 66 hex chars
    const expected = compressedHex.slice(2).toLowerCase();
    expect(deriveXOnlyFromAccount({ taproot: { pubkey: compressedHex } } as any)).toBe(expected);
  });

  it('returns null for malformed pubkey hex (wrong length / non-hex)', () => {
    expect(deriveXOnlyFromAccount({ taproot: { pubkey: 'abc' } } as any)).toBeNull();
    expect(deriveXOnlyFromAccount({ taproot: { pubKeyXOnly: 'not-hex-64-chars' } } as any)).toBeNull();
  });
});

// ===========================================================================

describe('deriveEphemeralRecoveryInternalPubkey — determinism', () => {
  it('same (network, user, ephemeral) always yields the same internal pubkey', () => {
    const network = bitcoin.networks.bitcoin;
    const userXOnly = makeRandomXOnly(network);
    const ephemeralXOnly = makeRandomXOnly(network);
    const a = deriveEphemeralRecoveryInternalPubkey({
      network, networkId: 'mainnet', userXOnlyPubkey: userXOnly, ephemeralXOnlyPubkey: ephemeralXOnly,
    });
    const b = deriveEphemeralRecoveryInternalPubkey({
      network, networkId: 'mainnet', userXOnlyPubkey: userXOnly, ephemeralXOnlyPubkey: ephemeralXOnly,
    });
    expect(a.toString('hex')).toBe(b.toString('hex'));
  });

  it('different networkIds produce different internal pubkeys (cross-network replay protection)', () => {
    const network = bitcoin.networks.bitcoin;
    const userXOnly = makeRandomXOnly(network);
    const ephemeralXOnly = makeRandomXOnly(network);
    const mainnet = deriveEphemeralRecoveryInternalPubkey({
      network, networkId: 'mainnet', userXOnlyPubkey: userXOnly, ephemeralXOnlyPubkey: ephemeralXOnly,
    });
    const regtest = deriveEphemeralRecoveryInternalPubkey({
      network: bitcoin.networks.regtest, networkId: 'subfrost-regtest',
      userXOnlyPubkey: userXOnly, ephemeralXOnlyPubkey: ephemeralXOnly,
    });
    expect(mainnet.toString('hex')).not.toBe(regtest.toString('hex'));
  });
});
