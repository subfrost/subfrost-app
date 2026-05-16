/**
 * fetchWalletState tests — dust filter, per-outpoint fanout, partial
 * failure tolerance, height annotation, BTC + alkane aggregation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchWalletState, ALKANE_DUST_MAX } from '../fetchWalletState';
import { __resetTipHashCacheForTests } from '../tipHash';

/** Build a fetch-mock response with the supplied JSON-RPC result. */
function rpcResult(result: unknown, ok = true) {
  return {
    ok,
    json: async () => ({ jsonrpc: '2.0', id: 1, result }),
  };
}

function rpcError(message: string) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: 1, error: { code: -1, message } }),
  };
}

const TAPROOT_ADDR = 'bc1ptarapdejnpvg3sq8muuvrt8eqya8nqr8muqcre52pxv69dndluwq6nwh3w';
const SEGWIT_ADDR = 'bc1qexamplesegwitaddressxxxxxxxxxxxxxxxxxxx';

/**
 * Hook the standard sequence that fetchWalletState emits. Inspect
 * the request body to decide what mock to return — order-based mocks
 * are brittle here because the three header fetches (tipHash, height,
 * bitcoind height) all start in parallel via Promise.all and the
 * await order is non-deterministic.
 */
function stageMocks(opts: {
  tipHeight: number;
  tipHash: string;
  metashrewHeight: number;
  bitcoindHeight: number;
  addressUtxos: Array<Array<{ txid: string; vout: number; value: number; blockHeight?: number | null }>>;
  outpointBalances: Array<Array<{ block: number; tx: number; amount: string }> | 'error'>;
}): void {
  // Track per-address-utxo and per-outpoint consumption counters so we
  // can serve in insertion order without depending on global call order.
  let addressIdx = 0;
  let outpointIdx = 0;

  mockFetch.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? '{}'));
    const method = body.method as string;
    if (method === 'metashrew_height') {
      // Both getCurrentTipHash and getHeight call this. Either consumer
      // accepts the same value when tip + metashrew agree (the common case
      // in these tests). For tests where they differ, the impl reads tip
      // first and uses it for getblockhash; the height field of the result
      // is independently captured from `getHeight`, so returning the
      // tipHeight here is safe as long as the caller staged them equal.
      return rpcResult(opts.tipHeight ?? opts.metashrewHeight) as Response;
    }
    if (method === 'metashrew_getblockhash') {
      return rpcResult(opts.tipHash) as Response;
    }
    if (method === 'esplora_blocks::tip:height') {
      return rpcResult(opts.bitcoindHeight) as Response;
    }
    if (method === 'esplora_address::utxo') {
      const list = opts.addressUtxos[addressIdx++] ?? [];
      return rpcResult(
        list.map((u) => ({
          txid: u.txid,
          vout: u.vout,
          value: u.value,
          status: {
            confirmed: u.blockHeight !== null && u.blockHeight !== undefined,
            block_height: u.blockHeight ?? undefined,
          },
        })),
      ) as Response;
    }
    if (method === 'alkanes_protorunesbyoutpoint') {
      const sheet = opts.outpointBalances[outpointIdx++];
      if (sheet === 'error' || sheet === undefined) {
        throw new Error('protorunesbyoutpoint 524');
      }
      return rpcResult({ balance_sheet: { cached: { balances: sheet } } }) as Response;
    }
    throw new Error(`unexpected RPC method in mock: ${method}`);
  });
}

describe('fetchWalletState', () => {
  beforeEach(() => {
    __resetTipHashCacheForTests();
    mockFetch.mockReset();
  });

  it('rejects empty address list', async () => {
    await expect(fetchWalletState('mainnet', [])).rejects.toThrow(/non-empty/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns annotated wallet state with single address + dust + BTC', async () => {
    stageMocks({
      tipHeight: 900_000,
      tipHash: '0xdeadbeef',
      metashrewHeight: 900_000,
      bitcoindHeight: 900_000,
      addressUtxos: [
        [
          { txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: 899_998 },
          { txid: 'b'.repeat(64), vout: 1, value: 50_000, blockHeight: 899_995 },
        ],
      ],
      outpointBalances: [
        [{ block: 2, tx: 0, amount: '5000' }],
      ],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(state.tipHash).toBe('deadbeef');
    expect(state.metashrewHeight).toBe(900_000);
    expect(state.bitcoindHeight).toBe(900_000);
    expect(state.utxos).toHaveLength(2);

    const dust = state.utxos.find((u) => u.value === 546);
    expect(dust).toBeDefined();
    expect(dust!.alkanes).toEqual([{ block: 2, tx: 0, amount: '5000' }]);
    expect(dust!.blockHeight).toBe(899_998);
    expect(dust!.confirmations).toBe(3); // 900_000 - 899_998 + 1

    const btc = state.utxos.find((u) => u.value === 50_000);
    expect(btc!.alkanes).toEqual([]); // non-dust skipped from fanout
    expect(btc!.confirmations).toBe(6); // 900_000 - 899_995 + 1

    // BTC sats split — taproot address goes to p2tr bucket
    expect(state.btcSats.p2tr).toBe(546 + 50_000);
    expect(state.btcSats.p2wpkh).toBe(0);
    expect(state.btcSats.total).toBe(546 + 50_000);
    expect(state.btcSats.spendable).toBe(50_000); // dust excluded from spendable

    expect(state.alkanes).toEqual({ '2:0': '5000' });
  });

  it('dust filter excludes UTXOs above ALKANE_DUST_MAX from the per-outpoint fanout', async () => {
    stageMocks({
      tipHeight: 1,
      tipHash: 'ab',
      metashrewHeight: 1,
      bitcoindHeight: 1,
      addressUtxos: [
        [
          { txid: 'a'.repeat(64), vout: 0, value: ALKANE_DUST_MAX, blockHeight: 1 },
          { txid: 'b'.repeat(64), vout: 0, value: ALKANE_DUST_MAX + 1, blockHeight: 1 },
        ],
      ],
      outpointBalances: [
        [{ block: 2, tx: 0, amount: '100' }],
        // No second sheet — only one dust UTXO survives the filter.
      ],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(state.utxos).toHaveLength(2);
    const onTheLimit = state.utxos.find((u) => u.value === ALKANE_DUST_MAX);
    const overTheLimit = state.utxos.find((u) => u.value === ALKANE_DUST_MAX + 1);
    expect(onTheLimit!.alkanes).toHaveLength(1);
    expect(overTheLimit!.alkanes).toEqual([]);

    // Calls: 2 (tip) + 1 (height) + 1 (bitcoind) + 1 (utxo list) + 1 (1× fanout) = 6
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('tolerates per-outpoint failure (allSettled)', async () => {
    stageMocks({
      tipHeight: 100,
      tipHash: 'cafe',
      metashrewHeight: 100,
      bitcoindHeight: 100,
      addressUtxos: [
        [
          { txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: 100 },
          { txid: 'b'.repeat(64), vout: 0, value: 546, blockHeight: 100 },
        ],
      ],
      outpointBalances: [
        'error',
        [{ block: 2, tx: 0, amount: '7000' }],
      ],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(state.utxos).toHaveLength(2);
    // The failed outpoint just has an empty balance sheet, not a hard throw
    expect(state.utxos[0].alkanes).toEqual([]);
    expect(state.utxos[1].alkanes).toEqual([{ block: 2, tx: 0, amount: '7000' }]);
    expect(state.alkanes).toEqual({ '2:0': '7000' });
  });

  it('annotates per-address bucketing for segwit + taproot addresses', async () => {
    stageMocks({
      tipHeight: 100,
      tipHash: 'cafe',
      metashrewHeight: 100,
      bitcoindHeight: 100,
      addressUtxos: [
        [{ txid: 'a'.repeat(64), vout: 0, value: 20_000, blockHeight: 99 }], // segwit
        [{ txid: 'b'.repeat(64), vout: 0, value: 5_000, blockHeight: 99 }],  // taproot
      ],
      outpointBalances: [], // no dust
    });

    const state = await fetchWalletState('mainnet', [SEGWIT_ADDR, TAPROOT_ADDR]);

    expect(state.btcSats.p2wpkh).toBe(20_000);
    expect(state.btcSats.p2tr).toBe(5_000);
    expect(state.btcSats.total).toBe(25_000);
    expect(state.btcSats.spendable).toBe(25_000);
  });

  it('mempool UTXOs (no block_height) get confirmations=0', async () => {
    stageMocks({
      tipHeight: 100,
      tipHash: 'cafe',
      metashrewHeight: 100,
      bitcoindHeight: 100,
      addressUtxos: [
        [
          { txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: null },
        ],
      ],
      outpointBalances: [
        [{ block: 2, tx: 0, amount: '100' }],
      ],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(state.utxos[0].blockHeight).toBe(null);
    expect(state.utxos[0].confirmations).toBe(0);
  });

  it('aggregates alkane balances across multiple dust outpoints', async () => {
    stageMocks({
      tipHeight: 100,
      tipHash: 'cafe',
      metashrewHeight: 100,
      bitcoindHeight: 100,
      addressUtxos: [
        [
          { txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: 99 },
          { txid: 'b'.repeat(64), vout: 0, value: 600, blockHeight: 99 },
        ],
      ],
      outpointBalances: [
        [
          { block: 2, tx: 0, amount: '3000' },
          { block: 32, tx: 0, amount: '1000' },
        ],
        [{ block: 2, tx: 0, amount: '2000' }],
      ],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(state.alkanes['2:0']).toBe('5000'); // 3000 + 2000
    expect(state.alkanes['32:0']).toBe('1000');
  });

  it('tolerates per-address UTXO fetch failure', async () => {
    // Two addresses; first errors out, second succeeds.
    // 1+2 = tipHash, 3 = metashrew_height, 4 = bitcoind height
    mockFetch.mockResolvedValueOnce(rpcResult(100));
    mockFetch.mockResolvedValueOnce(rpcResult('cafe'));
    mockFetch.mockResolvedValueOnce(rpcResult(100));
    mockFetch.mockResolvedValueOnce(rpcResult(100));
    // 5a: first address — error
    mockFetch.mockRejectedValueOnce(new Error('upstream 524'));
    // 5b: second address — single UTXO
    mockFetch.mockResolvedValueOnce(
      rpcResult([
        { txid: 'b'.repeat(64), vout: 0, value: 50_000, status: { confirmed: true, block_height: 100 } },
      ]),
    );
    // No dust → no fanout

    const state = await fetchWalletState('mainnet', [SEGWIT_ADDR, TAPROOT_ADDR]);

    expect(state.utxos).toHaveLength(1);
    expect(state.utxos[0].address).toBe(TAPROOT_ADDR);
    expect(state.btcSats.total).toBe(50_000);
  });
});
