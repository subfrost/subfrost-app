/**
 * Module-level ordinal skip store + execute.ts integration.
 *
 * Pins:
 *   - Set replaces snapshot atomically; getter reflects latest write.
 *   - Idempotent: writing deep-equal list does NOT notify subscribers (avoids
 *     re-render storms when the prewarmer's React Query returns a new array
 *     reference holding the same values).
 *   - alkanesExecuteTyped falls back to the store when neither per-call
 *     `params.skipOutpoints` nor `params.txContext.skipOutpoints` is set —
 *     this is the always-on prefetch path that guarantees no ord round-trip
 *     happens at PSBT construction time.
 *   - Per-call params and txContext still override the store (per-call wins).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

import {
  __resetOrdinalSkipStoreForTests,
  getOrdinalSkipOutpoints,
  setOrdinalSkipOutpoints,
  subscribeOrdinalSkipOutpoints,
} from '../ordinalSkipStore';
import { alkanesExecuteTyped } from '../execute';

bitcoin.initEccLib(ecc);

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

function fakeProvider() {
  return {
    alkanesExecuteWithStrings: vi.fn(async () => JSON.stringify({ psbtBase64: 'fake' })),
    alkanesExecuteFull: vi.fn(async () => JSON.stringify({ txid: 'fake' })),
    sandshrew_rpc_url: () => null,
  };
}

function lastOptions(provider: ReturnType<typeof fakeProvider>): Record<string, unknown> {
  const calls = provider.alkanesExecuteWithStrings.mock.calls as unknown as string[][];
  const call = calls.at(-1);
  if (!call) throw new Error('alkanesExecuteWithStrings was not called');
  return JSON.parse(call[5]);
}

beforeEach(() => __resetOrdinalSkipStoreForTests());
afterEach(() => {
  __resetOrdinalSkipStoreForTests();
  vi.restoreAllMocks();
});

describe('ordinalSkipStore', () => {
  it('getter returns [] when nothing was written', () => {
    expect(getOrdinalSkipOutpoints()).toEqual([]);
  });

  it('set replaces snapshot atomically', () => {
    setOrdinalSkipOutpoints(['a:0', 'b:1']);
    expect(getOrdinalSkipOutpoints()).toEqual(['a:0', 'b:1']);
    setOrdinalSkipOutpoints(['c:2']);
    expect(getOrdinalSkipOutpoints()).toEqual(['c:2']);
  });

  it('writing deep-equal list does NOT notify subscribers (idempotent)', () => {
    const seen: string[][] = [];
    const unsub = subscribeOrdinalSkipOutpoints((v) => seen.push(v));
    setOrdinalSkipOutpoints(['a:0', 'b:1']);
    setOrdinalSkipOutpoints(['a:0', 'b:1']); // same values, new array ref
    setOrdinalSkipOutpoints(['a:0', 'b:2']); // different
    unsub();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toEqual(['a:0', 'b:1']);
    expect(seen[1]).toEqual(['a:0', 'b:2']);
  });

  it('subscribers receive every distinct snapshot', () => {
    const seen: string[][] = [];
    const unsub = subscribeOrdinalSkipOutpoints((v) => seen.push(v));
    setOrdinalSkipOutpoints(['a:0']);
    setOrdinalSkipOutpoints([]);
    setOrdinalSkipOutpoints(['a:0', 'b:1']);
    unsub();
    expect(seen.map((s) => s.length)).toEqual([1, 0, 2]);
  });

  it('unsubscribed callback no longer fires', () => {
    let calls = 0;
    const unsub = subscribeOrdinalSkipOutpoints(() => calls++);
    setOrdinalSkipOutpoints(['a:0']);
    unsub();
    setOrdinalSkipOutpoints(['a:0', 'b:1']);
    expect(calls).toBe(1);
  });
});

describe('alkanesExecuteTyped falls back to module store', () => {
  it('uses store snapshot when neither params nor txContext supplies skipOutpoints', async () => {
    setOrdinalSkipOutpoints(['fromstore:0', 'fromstore:1']);
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, {
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 5,
      network: 'mainnet',
    });
    const opts = lastOptions(p);
    expect(opts.skip_outpoints).toEqual(['fromstore:0', 'fromstore:1']);
    expect(opts.skipOutpoints).toEqual(['fromstore:0', 'fromstore:1']);
  });

  it('omits skip_outpoints when store is empty AND no override is given', async () => {
    // Default state — guarantees we never send a no-op empty list that would
    // be parsed by the WASM as "user said skip nothing" vs the desired
    // "field not present, use SDK default".
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, {
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 5,
      network: 'mainnet',
    });
    const opts = lastOptions(p);
    expect(opts.skip_outpoints).toBeUndefined();
    expect(opts.skipOutpoints).toBeUndefined();
  });

  it('txContext.skipOutpoints wins over store snapshot', async () => {
    setOrdinalSkipOutpoints(['fromstore:0']);
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, {
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 5,
      network: 'mainnet',
      txContext: {
        feeSourceAddresses: ['bc1ptap'],
        btcChangeAddress: 'bc1ptap',
        alkanesChangeAddress: 'bc1ptap',
        shouldProtectTaproot: false,
        defaultOrdinalsStrategy: 'split',
        skipOutpoints: ['fromtxctx:0'],
        walletType: 'keystore',
      },
    });
    expect(lastOptions(p).skip_outpoints).toEqual(['fromtxctx:0']);
  });

  it('per-call params.skipOutpoints wins over BOTH txContext AND store', async () => {
    setOrdinalSkipOutpoints(['fromstore:0']);
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, {
      inputRequirements: '',
      protostones: '[2,0,77]:v0:v0',
      feeRate: 5,
      network: 'mainnet',
      txContext: {
        feeSourceAddresses: ['bc1ptap'],
        btcChangeAddress: 'bc1ptap',
        alkanesChangeAddress: 'bc1ptap',
        shouldProtectTaproot: false,
        defaultOrdinalsStrategy: 'split',
        skipOutpoints: ['fromtxctx:0'],
        walletType: 'keystore',
      },
      skipOutpoints: ['percall:0'],
    });
    expect(lastOptions(p).skip_outpoints).toEqual(['percall:0']);
  });
});
