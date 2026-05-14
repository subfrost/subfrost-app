/**
 * Coverage for `alkanesExecuteTyped` — the single dispatch point for
 * every mutation (swap / wrap / unwrap / addLiquidity / removeLiquidity /
 * sends / atomic flows). Until this file it had zero direct tests; bugs
 * surfaced only through brittle integration paths.
 *
 * What this pins:
 *
 *   1. Address synthesis defaults — when neither per-call addresses
 *      nor `txContext` are set, the wrapper falls back to symbolic
 *      `'p2wpkh:0'` / `'p2tr:0'` (only safe for the boot path).
 *
 *   2. `txContext` propagation — `feeSourceAddresses`,
 *      `btcChangeAddress`, `alkanesChangeAddress`,
 *      `defaultOrdinalsStrategy`, `shouldProtectTaproot` all flow into
 *      the WASM `options` object. Per-call overrides win.
 *
 *   3. `cachedUtxos` clean filter — only UTXOs with `value > 1000` AND
 *      zero alkanes AND zero runes become `payment_utxos`. A regression
 *      where the dust threshold drops or the alkane filter is removed
 *      would pick alkane-bearing dust as fee inputs and burn the
 *      tokens (the recurring class of incident documented in CLAUDE.md).
 *
 *   4. `prefetched_utxos` alkanes-assertion shape — `[]` vs populated.
 *      Each entry's `alkanes` field is `Some(vec)` in the SDK contract
 *      (`[]` = "asserted clean — do not query RPC"). A regression
 *      omitting this field falls back to per-UTXO RPC fanout (40s on
 *      36-dust-UTXO wallets — the 2026-05-09 perf regression).
 *
 *   5. `split_transactions` wire-through — load-bearing for atomic
 *      CPFP. Documented in source as the field whose absence turns the
 *      hook's `splitTransactions: true` into a silent no-op (the
 *      2026-05-03 mainnet incident where wrap+swap broadcast only one
 *      tx).
 *
 *   6. Path selection — `alkanesExecuteFull` for autoConfirm/local
 *      networks, `alkanesExecuteWithStrings` otherwise; `forcePsbt`
 *      forces the PSBT path; `wantPreview` (keystore+preview on
 *      mainnet) keeps the PSBT path so the modal can run.
 *
 * The provider is mocked at the function-pointer level — the real WASM
 * SDK isn't loaded; we just capture the JSON strings passed to it and
 * assert on their contents.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';

import { alkanesExecuteTyped } from '../execute';
import type { AlkanesExecuteTypedParams } from '../types';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const _kp = ECPair.fromPrivateKey(Buffer.from('2'.repeat(64), 'hex'));
const _internalPubkey = Buffer.from(_kp.publicKey).slice(1, 33);
const REAL_TAPROOT = bitcoin.payments.p2tr({
  internalPubkey: _internalPubkey,
  network: bitcoin.networks.bitcoin,
}).address!;

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

interface FakeProvider {
  alkanesExecuteWithStrings: ReturnType<typeof vi.fn>;
  alkanesExecuteFull?: ReturnType<typeof vi.fn>;
  sandshrew_rpc_url?: () => string | null;
}

function fakeProvider(overrides: Partial<FakeProvider> = {}): FakeProvider {
  return {
    alkanesExecuteWithStrings: vi.fn(async () => JSON.stringify({ psbtBase64: 'fakepsbt' })),
    alkanesExecuteFull: vi.fn(async () => JSON.stringify({ txid: 'faketxid' })),
    sandshrew_rpc_url: () => null, // skip the max_indexed_height probe
    ...overrides,
  };
}

function baseParams(over: Partial<AlkanesExecuteTypedParams> = {}): AlkanesExecuteTypedParams {
  return {
    inputRequirements: '',
    protostones: '[2,0,77]:v0:v0',
    feeRate: 5,
    network: 'mainnet', // espo → skips fetch probe
    ...over,
  };
}

function lastOptionsJson(provider: FakeProvider): Record<string, unknown> {
  const call = provider.alkanesExecuteWithStrings.mock.calls.at(-1);
  if (!call) throw new Error('alkanesExecuteWithStrings was not called');
  return JSON.parse(call[5] as string);
}

function lastFullOptionsJson(provider: FakeProvider): Record<string, unknown> {
  const call = provider.alkanesExecuteFull!.mock.calls.at(-1);
  if (!call) throw new Error('alkanesExecuteFull was not called');
  return JSON.parse(call[5] as string);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===========================================================================

describe('Address synthesis defaults', () => {
  it('falls back to symbolic [p2wpkh:0, p2tr:0] when no addresses are supplied (boot path only)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams());
    const opts = lastOptionsJson(p);
    expect(opts.from).toEqual(['p2wpkh:0', 'p2tr:0']);
    expect(opts.from_addresses).toEqual(['p2wpkh:0', 'p2tr:0']);
    expect(opts.change_address).toBe('p2wpkh:0');
    expect(opts.alkanes_change_address).toBe('p2tr:0');
  });

  it('inherits all address fields from txContext when set', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      txContext: {
        feeSourceAddresses: ['bc1qsegwit', 'bc1ptap'],
        btcChangeAddress: 'bc1qsegwit',
        alkanesChangeAddress: 'bc1ptap',
        shouldProtectTaproot: true,
        defaultOrdinalsStrategy: 'preserve',
        walletType: 'browser',
        browserWalletId: 'xverse',
      },
    }));
    const opts = lastOptionsJson(p);
    expect(opts.from).toEqual(['bc1qsegwit', 'bc1ptap']);
    expect(opts.change_address).toBe('bc1qsegwit');
    expect(opts.alkanes_change_address).toBe('bc1ptap');
    expect(opts.protect_taproot).toBe(true);
    expect(opts.ordinals_strategy).toBe('preserve');
  });

  it('per-call address overrides win over txContext', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      txContext: {
        feeSourceAddresses: ['bc1qtxctx'],
        btcChangeAddress: 'bc1qtxctx',
        alkanesChangeAddress: 'bc1ptxctx',
        shouldProtectTaproot: false,
        defaultOrdinalsStrategy: 'burn',
        walletType: 'keystore',
      },
      fromAddresses: ['bc1qoverride'],
      changeAddress: 'bc1qoverride_change',
      alkanesChangeAddress: 'bc1poverride_alkanes',
      ordinalsStrategy: 'preserve',
      protectTaproot: true,
    }));
    const opts = lastOptionsJson(p);
    expect(opts.from).toEqual(['bc1qoverride']);
    expect(opts.change_address).toBe('bc1qoverride_change');
    expect(opts.alkanes_change_address).toBe('bc1poverride_alkanes');
    expect(opts.protect_taproot).toBe(true);
    expect(opts.ordinals_strategy).toBe('preserve');
  });

  it('keystore txContext defaults inherited correctly (burn + no protect)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      txContext: {
        feeSourceAddresses: ['bc1ptaponly'],
        btcChangeAddress: 'bc1ptaponly',
        alkanesChangeAddress: 'bc1ptaponly',
        shouldProtectTaproot: false,
        defaultOrdinalsStrategy: 'burn',
        walletType: 'keystore',
      },
    }));
    const opts = lastOptionsJson(p);
    expect(opts.protect_taproot).toBe(false);
    expect(opts.ordinals_strategy).toBe('burn');
  });
});

// ===========================================================================

describe('cachedUtxos → payment_utxos clean filter', () => {
  it('only non-dust + zero-alkane + zero-rune UTXOs become payment_utxos', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      cachedUtxos: [
        // Clean: 100k sats, no alkanes, no runes
        { txid: 'a'.repeat(64), vout: 0, value: 100_000 },
        // Dust: 600 sats — filtered (alkane carrier suspected)
        { txid: 'b'.repeat(64), vout: 0, value: 600 },
        // Alkane-bearing dust: filtered
        {
          txid: 'c'.repeat(64), vout: 0, value: 600,
          alkanes: [{ block: 2, tx: 0, amount: 100n }],
        },
        // Inscribed (rune-bearing): filtered
        {
          txid: 'd'.repeat(64), vout: 0, value: 10_000,
          runes: [{ id: '1:0' }],
        },
        // Clean: 50k sats
        { txid: 'e'.repeat(64), vout: 1, value: 50_000 },
      ],
    }));
    const opts = lastOptionsJson(p);
    const pay = opts.payment_utxos as Array<{ txid: string; value: number }>;
    expect(pay).toHaveLength(2);
    expect(pay.map((u) => u.txid).sort()).toEqual(['a'.repeat(64), 'e'.repeat(64)]);
    expect(pay.every((u) => u.value > 1000)).toBe(true);
  });

  it('no payment_utxos emitted when no clean cached UTXOs are eligible', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      cachedUtxos: [
        { txid: 'a'.repeat(64), vout: 0, value: 600 }, // dust
        {
          txid: 'b'.repeat(64), vout: 0, value: 10_000,
          alkanes: [{ block: 2, tx: 0, amount: 100n }],
        },
      ],
    }));
    const opts = lastOptionsJson(p);
    expect(opts.payment_utxos).toBeUndefined();
  });

  it('explicit paymentUtxos param wins over cachedUtxos clean-filter', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      paymentUtxos: ['txid:0:100000'],
      cachedUtxos: [{ txid: 'a'.repeat(64), vout: 0, value: 50_000 }],
    }));
    const opts = lastOptionsJson(p);
    expect(opts.payment_utxos).toEqual(['txid:0:100000']);
  });
});

// ===========================================================================

describe('cachedUtxos → prefetched_utxos shape (alkane-assertion semantics)', () => {
  it('clean BTC UTXO emits prefetched entry with alkanes:[]', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      cachedUtxos: [
        { txid: 'a'.repeat(64), vout: 0, value: 100_000, address: REAL_TAPROOT },
      ],
    }));
    const opts = lastOptionsJson(p);
    const prefetched = opts.prefetched_utxos as Array<{
      outpoint: string;
      value: number;
      alkanes: unknown[];
    }>;
    expect(prefetched).toHaveLength(1);
    expect(prefetched[0].outpoint).toBe(`${'a'.repeat(64)}:0`);
    // Critical: empty array, NOT undefined (SDK contract — `Some(vec![])`
    // means "asserted clean", `None` means "query RPC").
    expect(Array.isArray(prefetched[0].alkanes)).toBe(true);
    expect(prefetched[0].alkanes).toEqual([]);
  });

  it('alkane-bearing UTXO emits prefetched entry with populated alkanes', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      cachedUtxos: [
        {
          txid: 'b'.repeat(64), vout: 0, value: 600, address: REAL_TAPROOT,
          alkanes: [{ block: 2, tx: 0, amount: 500_000n }],
        },
      ],
    }));
    const opts = lastOptionsJson(p);
    const prefetched = opts.prefetched_utxos as Array<{
      outpoint: string;
      alkanes: Array<{ block: number; tx: number; amount: string }>;
    }>;
    expect(prefetched).toHaveLength(1);
    expect(prefetched[0].alkanes).toEqual([
      { block: 2, tx: 0, amount: '500000' },
    ]);
  });

  it('UTXO with neither address nor scriptPubKeyHex is silently dropped (not crashed on)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      cachedUtxos: [
        { txid: 'c'.repeat(64), vout: 0, value: 100_000 }, // no address
        { txid: 'd'.repeat(64), vout: 1, value: 50_000, address: REAL_TAPROOT },
      ],
    }));
    const opts = lastOptionsJson(p);
    const prefetched = opts.prefetched_utxos as Array<{ outpoint: string }>;
    expect(prefetched).toHaveLength(1);
    expect(prefetched[0].outpoint).toBe(`${'d'.repeat(64)}:1`);
  });
});

// ===========================================================================

describe('split_transactions wire-through (atomic CPFP gate)', () => {
  it('options.split_transactions = true when params.splitTransactions=true', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      splitTransactions: true,
    }));
    expect(lastOptionsJson(p).split_transactions).toBe(true);
  });

  it('options.split_transactions absent when not set (so SDK default applies)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({}));
    expect('split_transactions' in lastOptionsJson(p)).toBe(false);
  });

  it('options.split_transactions = false survives wire-through (explicit opt-out)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      splitTransactions: false,
    }));
    expect(lastOptionsJson(p).split_transactions).toBe(false);
  });
});

// ===========================================================================

describe('Pass-through option flags', () => {
  it.each([
    ['traceEnabled', 'trace_enabled', true],
    ['mineEnabled', 'mine_enabled', true],
    ['autoConfirm', 'auto_confirm', false], // false because true triggers Full-path branch
    ['rawOutput', 'raw_output', true],
  ] as const)('%s → options.%s', async (paramKey, optKey, value) => {
    const p = fakeProvider({ alkanesExecuteFull: undefined });
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      [paramKey]: value,
    } as Partial<AlkanesExecuteTypedParams>));
    expect(lastOptionsJson(p)[optKey]).toBe(value);
  });

  it('knownPendingTxHexes → options.known_pending_tx_hexes (when non-empty)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      knownPendingTxHexes: ['deadbeef', 'cafebabe'],
    }));
    const opts = lastOptionsJson(p);
    expect(opts.known_pending_tx_hexes).toEqual(['deadbeef', 'cafebabe']);
    expect(opts.knownPendingTxHexes).toEqual(['deadbeef', 'cafebabe']);
  });

  it('knownPendingTxHexes=[] is treated as "do not include" (does not poison options)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      knownPendingTxHexes: [],
    }));
    const opts = lastOptionsJson(p);
    expect('known_pending_tx_hexes' in opts).toBe(false);
  });
});

// ===========================================================================

describe('Dispatch — alkanesExecuteFull vs alkanesExecuteWithStrings', () => {
  it('keystore + autoConfirm on mainnet → alkanesExecuteFull (mine_enabled NOT set)', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      autoConfirm: true,
      txContext: {
        feeSourceAddresses: ['bc1ptap'],
        btcChangeAddress: 'bc1ptap',
        alkanesChangeAddress: 'bc1ptap',
        shouldProtectTaproot: false,
        defaultOrdinalsStrategy: 'burn',
        walletType: 'keystore',
      },
    }));
    expect(p.alkanesExecuteFull).toHaveBeenCalledTimes(1);
    expect(p.alkanesExecuteWithStrings).not.toHaveBeenCalled();
    const opts = lastFullOptionsJson(p);
    expect(opts.auto_confirm).toBe(true);
    // mainnet → mine_enabled NOT auto-set (would mine locally).
    expect(opts.mine_enabled).toBeUndefined();
  });

  it('local network (devnet) → alkanesExecuteFull WITH mine_enabled', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      network: 'devnet',
      autoConfirm: true,
      utxoSource: 'metashrew', // skip espo→fetch path
      // Note: max_indexed_height probe is gated on rpcUrl from provider AND
      // not containing localhost:18888. Our fakeProvider returns null so probe skipped.
    }));
    expect(p.alkanesExecuteFull).toHaveBeenCalledTimes(1);
    const opts = lastFullOptionsJson(p);
    expect(opts.mine_enabled).toBe(true);
    expect(opts.auto_confirm).toBe(true);
  });

  it('forcePsbt forces alkanesExecuteWithStrings even when autoConfirm=true', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      autoConfirm: true,
      forcePsbt: true,
    }));
    expect(p.alkanesExecuteWithStrings).toHaveBeenCalledTimes(1);
    expect(p.alkanesExecuteFull).not.toHaveBeenCalled();
  });

  it('browser (no autoConfirm) → alkanesExecuteWithStrings PSBT path', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      txContext: {
        feeSourceAddresses: ['bc1q', 'bc1p'],
        btcChangeAddress: 'bc1q',
        alkanesChangeAddress: 'bc1p',
        shouldProtectTaproot: true,
        defaultOrdinalsStrategy: 'preserve',
        walletType: 'browser',
      },
    }));
    expect(p.alkanesExecuteWithStrings).toHaveBeenCalledTimes(1);
    expect(p.alkanesExecuteFull).not.toHaveBeenCalled();
  });

  it('result is parsed JSON when the provider returns a JSON string', async () => {
    const p = fakeProvider({
      alkanesExecuteWithStrings: vi.fn(async () =>
        JSON.stringify({ psbtBase64: 'AABBCC', readyToSign: { fee: 1234 } }),
      ),
    });
    const result = await alkanesExecuteTyped(p as unknown as WebProvider, baseParams());
    expect(result).toEqual({ psbtBase64: 'AABBCC', readyToSign: { fee: 1234 } });
  });

  it('result passed through when the provider returns an object directly', async () => {
    const obj = { psbtBase64: 'XYZ' };
    const p = fakeProvider({
      alkanesExecuteWithStrings: vi.fn(async () => obj as unknown as string),
    });
    const result = await alkanesExecuteTyped(p as unknown as WebProvider, baseParams());
    expect(result).toBe(obj);
  });
});

// ===========================================================================

describe('toAddresses synthesis from protostones', () => {
  it('uses explicit toAddresses when provided', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      toAddresses: ['bc1pcustom0', 'bc1pcustom1'],
    }));
    const arg = JSON.parse(p.alkanesExecuteWithStrings.mock.calls[0][0] as string);
    expect(arg).toEqual(['bc1pcustom0', 'bc1pcustom1']);
  });

  it('synthesizes from protostones maxVout when toAddresses is unset', async () => {
    // Single protostone `[2,0,77]:v0:v0` → maxVout=0 → 1 address.
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams());
    const arg = JSON.parse(p.alkanesExecuteWithStrings.mock.calls[0][0] as string);
    expect(arg.length).toBe(1);
    expect(arg[0]).toBe('p2tr:0');
  });
});

// ===========================================================================

describe('utxo_source resolution', () => {
  it('mainnet defaults to espo', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams());
    expect(lastOptionsJson(p).utxo_source).toBe('espo');
  });

  it('non-mainnet defaults to metashrew', async () => {
    // The probe runs because utxo_source !== 'espo' — but our fake
    // provider's sandshrew_rpc_url returns null, so the probe early-exits.
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      network: 'subfrost-regtest',
    }));
    expect(lastOptionsJson(p).utxo_source).toBe('metashrew');
  });

  it('explicit utxoSource override wins', async () => {
    const p = fakeProvider();
    await alkanesExecuteTyped(p as unknown as WebProvider, baseParams({
      network: 'mainnet',
      utxoSource: 'metashrew',
    }));
    expect(lastOptionsJson(p).utxo_source).toBe('metashrew');
  });
});
