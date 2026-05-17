/**
 * Wire-shape coverage for lib/alkanes/rpc.ts beyond broadcastTransactions.
 *
 * Every helper in this file is one JSON-RPC POST to `subfrostRpcUrl(network)`
 * — these tests pin the {method, params} payload each helper emits and the
 * shape it returns, so a regression renaming an upstream method (e.g.
 * `alkanes_protorunesbyaddress` → `alkanes_protorunesByAddress`) or
 * silently swallowing a non-array response trips here loud.
 *
 * The fetch seam is the only thing mocked — `jsonRpcCall` (internal) is
 * exercised end-to-end. That's deliberate: it's what catches changes to
 * the body schema, error-sentinel handling, and the upstream URL builder.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  alkanesSimulate,
  getProtorunesByAddress,
  getProtorunesByOutpoint,
  getAddressUtxos,
  getAddressMempoolTxs,
  getHeight,
  getEsploraTx,
  broadcastTransaction,
  broadcastTransactions,
  metashrewView,
  luaEvalScript,
} from '../rpc';

type LoggedCall = { url: string; body: { method: string; params: unknown[]; id?: number } };

function stubFetch(reply: unknown, status: number = 200): { calls: LoggedCall[] } {
  const calls: LoggedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as LoggedCall['body'];
      calls.push({ url, body });
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, result: reply }),
        { status, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return { calls };
}

function stubFetchError(code: number, message: string): { calls: LoggedCall[] } {
  const calls: LoggedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}') as LoggedCall['body'];
      calls.push({ url, body });
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: body.id ?? 1, error: { code, message } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return { calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================

describe('alkanesSimulate', () => {
  it('posts alkanes_simulate with the target + inputs + defaulted height/txindex/vout', async () => {
    const { calls } = stubFetch({ status: 0, execution: { data: '0xdead' } });
    const result = await alkanesSimulate('mainnet', {
      target: '4:65498',
      inputs: ['97'],
    });
    expect(result).toEqual({ status: 0, execution: { data: '0xdead' } });
    expect(calls).toHaveLength(1);
    expect(calls[0].body.method).toBe('alkanes_simulate');
    const payload = calls[0].body.params[0] as Record<string, unknown>;
    expect(payload.target).toBe('4:65498');
    expect(payload.inputs).toEqual(['97']);
    expect(payload.alkanes).toEqual([]);
    expect(payload.transaction).toBe('0x');
    expect(payload.block).toBe('0x');
    // Defaults — flex 2026-05-04: pool reads use latest state, so height
    // defaults to '1' (treated as 'latest' by metashrew) and txindex/vout
    // default to 0.
    expect(payload.height).toBe('1');
    expect(payload.txindex).toBe(0);
    expect(payload.vout).toBe(0);
  });

  it('respects caller-provided alkanes + height + txindex + vout overrides', async () => {
    const { calls } = stubFetch({ status: 0 });
    await alkanesSimulate('subfrost-regtest', {
      target: '2:0',
      inputs: ['77'],
      alkanes: [{ id: { block: '2', tx: '0' }, value: '100' }],
      height: '12345',
      txindex: 3,
      vout: 1,
    });
    const payload = calls[0].body.params[0] as Record<string, unknown>;
    expect(payload.alkanes).toEqual([{ id: { block: '2', tx: '0' }, value: '100' }]);
    expect(payload.height).toBe('12345');
    expect(payload.txindex).toBe(3);
    expect(payload.vout).toBe(1);
  });
});

// ===========================================================================

describe('getProtorunesByAddress', () => {
  it('posts alkanes_protorunesbyaddress with protocolTag=1', async () => {
    const { calls } = stubFetch({ outpoints: [], balances: { entries: [] } });
    const result = await getProtorunesByAddress('mainnet', 'bc1pxyz');
    expect(result).toEqual({ outpoints: [], balances: { entries: [] } });
    expect(calls[0].body.method).toBe('alkanes_protorunesbyaddress');
    expect(calls[0].body.params[0]).toEqual({ address: 'bc1pxyz', protocolTag: '1' });
  });
});

// ===========================================================================

describe('getProtorunesByOutpoint', () => {
  it('posts alkanes_protorunesbyoutpoint with txid+vout+protocolTag', async () => {
    const { calls } = stubFetch({ balance_sheet: { cached: { balances: [] } } });
    const result = await getProtorunesByOutpoint('mainnet', 'a'.repeat(64), 0);
    expect(result.balance_sheet?.cached?.balances).toEqual([]);
    expect(calls[0].body.method).toBe('alkanes_protorunesbyoutpoint');
    expect(calls[0].body.params[0]).toEqual({
      txid: 'a'.repeat(64),
      vout: 0,
      protocolTag: '1',
    });
  });
});

// ===========================================================================

describe('getAddressUtxos — error-sentinel guard', () => {
  it('returns the UTXO array on a normal array result', async () => {
    stubFetch([
      { txid: 'a'.repeat(64), vout: 0, value: 10_000 },
      { txid: 'b'.repeat(64), vout: 1, value: 600 },
    ]);
    const utxos = await getAddressUtxos('mainnet', 'bc1pxyz');
    expect(utxos).toHaveLength(2);
    expect(utxos[1].value).toBe(600);
  });

  it('returns [] when upstream returns a string error sentinel instead of an array', async () => {
    // Some upstream gateways return "legacy address base58 string" as the
    // result field on a malformed/unsupported address. The wrapper MUST
    // not bubble that through as a typed UTXO[].
    stubFetch('legacy address base58 string');
    const utxos = await getAddressUtxos('mainnet', 'oops');
    expect(utxos).toEqual([]);
  });

  it('returns [] when upstream returns null', async () => {
    stubFetch(null);
    const utxos = await getAddressUtxos('mainnet', 'bc1pxyz');
    expect(utxos).toEqual([]);
  });
});

// ===========================================================================

describe('getAddressMempoolTxs', () => {
  it('returns the array of mempool transactions', async () => {
    stubFetch([{ txid: 'a'.repeat(64), vin: [{ txid: 'b'.repeat(64), vout: 0 }] }]);
    const txs = await getAddressMempoolTxs('mainnet', 'bc1pxyz');
    expect(txs).toHaveLength(1);
    expect(txs[0].vin?.[0].vout).toBe(0);
  });

  it('returns [] when upstream returns a non-array (string sentinel etc.)', async () => {
    stubFetch('not-an-array');
    const txs = await getAddressMempoolTxs('mainnet', 'bc1pxyz');
    expect(txs).toEqual([]);
  });
});

// ===========================================================================

describe('getHeight', () => {
  it('returns a number from a string result (metashrew sometimes returns "12345")', async () => {
    stubFetch('12345');
    const h = await getHeight('mainnet');
    expect(h).toBe(12_345);
  });

  it('returns a number from a numeric result', async () => {
    stubFetch(67_890);
    const h = await getHeight('mainnet');
    expect(h).toBe(67_890);
  });

  it('posts metashrew_height with no params', async () => {
    const { calls } = stubFetch(1);
    await getHeight('mainnet');
    expect(calls[0].body.method).toBe('metashrew_height');
    expect(calls[0].body.params).toEqual([]);
  });
});

// ===========================================================================

describe('getEsploraTx', () => {
  it('returns the transaction object on success', async () => {
    stubFetch({
      txid: 'c'.repeat(64),
      status: { confirmed: true, block_height: 100 },
    });
    const tx = await getEsploraTx('mainnet', 'c'.repeat(64));
    expect(tx?.txid).toBe('c'.repeat(64));
    expect(tx?.status?.confirmed).toBe(true);
  });

  it('returns null when the indexer does not yet know the tx', async () => {
    // Common state for a freshly-broadcast tx — the wrapper must not
    // crash the caller's polling loop with a thrown error.
    stubFetchError(-32000, 'tx not found');
    const tx = await getEsploraTx('mainnet', 'd'.repeat(64));
    expect(tx).toBeNull();
  });

  it('returns null when the upstream result is null', async () => {
    stubFetch(null);
    const tx = await getEsploraTx('mainnet', 'e'.repeat(64));
    expect(tx).toBeNull();
  });
});

// ===========================================================================

describe('broadcastTransaction', () => {
  it('posts sendrawtransaction with [txHex]', async () => {
    const { calls } = stubFetch('f'.repeat(64));
    const txid = await broadcastTransaction('mainnet', 'aa'.repeat(32));
    expect(txid).toBe('f'.repeat(64));
    expect(calls[0].body.method).toBe('sendrawtransaction');
    expect(calls[0].body.params).toEqual(['aa'.repeat(32)]);
  });
});

// ===========================================================================

describe('broadcastTransactions — atomic package only, NO fallback', () => {
  it('posts a single submitpackage and returns the result array', async () => {
    const { calls } = stubFetch(['txid_parent', 'txid_child']);
    const result = await broadcastTransactions('mainnet', ['aa', 'bb']);
    expect(result).toEqual(['txid_parent', 'txid_child']);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.method).toBe('submitpackage');
    expect(calls[0].body.params[0]).toEqual(['aa', 'bb']);
  });

  it('unwraps a {txids: [...]} result shape', async () => {
    stubFetch({ txids: ['p', 'c'] });
    const result = await broadcastTransactions('mainnet', ['aa', 'bb']);
    expect(result).toEqual(['p', 'c']);
  });

  it('throws loudly on -32601 (no silent fallback to back-to-back sendrawtransaction)', async () => {
    // This was the pre-2026-05-10 silent-fallback behaviour that broke
    // the CPFP atomicity guarantee. The wrapper MUST surface the
    // missing-method error so the caller can fail the broadcast loudly
    // instead of degrading to a non-atomic broadcast.
    stubFetchError(-32601, 'Method not found');
    await expect(broadcastTransactions('mainnet', ['aa', 'bb'])).rejects.toThrow(
      /Method not found/,
    );
  });

  it('throws on any other RPC error so atomic-broadcast failure is loud', async () => {
    stubFetchError(-26, 'package-relay-failure: insufficient parent fee');
    await expect(broadcastTransactions('mainnet', ['aa', 'bb'])).rejects.toThrow(
      /package-relay-failure/,
    );
  });
});

// ===========================================================================

describe('metashrewView', () => {
  it('posts metashrew_view with [viewFn, hexParams, blockTag=latest by default]', async () => {
    const { calls } = stubFetch('0xdeadbeef');
    const result = await metashrewView('mainnet', 'simulate', '0xabcd');
    expect(result).toBe('0xdeadbeef');
    expect(calls[0].body.method).toBe('metashrew_view');
    expect(calls[0].body.params).toEqual(['simulate', '0xabcd', 'latest']);
  });

  it('forwards an explicit blockTag override', async () => {
    const { calls } = stubFetch('0x00');
    await metashrewView('mainnet', 'protorunesbyaddress', '0x01', '0x123');
    expect(calls[0].body.params[2]).toBe('0x123');
  });
});

// ===========================================================================

describe('luaEvalScript', () => {
  it('posts lua_evalscript with [script, JSON.stringify(args)]', async () => {
    const { calls } = stubFetch({ ok: true });
    const result = await luaEvalScript<{ ok: boolean }>(
      'mainnet',
      'return arg[1] + arg[2]',
      [1, 2],
    );
    expect(result.ok).toBe(true);
    expect(calls[0].body.method).toBe('lua_evalscript');
    expect(calls[0].body.params[0]).toBe('return arg[1] + arg[2]');
    expect(calls[0].body.params[1]).toBe(JSON.stringify([1, 2]));
  });

  it('passes the typed result through without transformation', async () => {
    stubFetch([{ height: 1, txid: 'a' }]);
    const result = await luaEvalScript<Array<{ height: number; txid: string }>>(
      'mainnet',
      'script',
      [],
    );
    expect(result).toEqual([{ height: 1, txid: 'a' }]);
  });
});
