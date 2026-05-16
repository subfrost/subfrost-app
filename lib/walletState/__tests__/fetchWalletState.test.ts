/**
 * fetchWalletState tests — dust filter, per-outpoint fanout, partial
 * failure tolerance, height annotation, BTC + alkane aggregation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock the canonical metashrew_view protorunesbyoutpoint helper at the
// module level. The wire format (protobuf-encoded request, hex-encoded
// response) has its own dedicated tests in
// `lib/alkanes/__tests__/protorunesByOutpointMV.test.ts` — these tests
// pin the FANOUT BEHAVIOUR (dust filter, error tolerance, balance
// aggregation), not the wire format. Mocking at the helper boundary
// keeps the test asserting on what fetchWalletState DOES with the
// per-outpoint results.
const mvCalls: Array<{ txid: string; vout: number; blockTag: string }> = [];
vi.mock('@/lib/alkanes/protorunesByOutpointMV', () => ({
  getProtorunesByOutpointMV: vi.fn(
    async (
      _network: string,
      txid: string,
      vout: number,
      blockTag: string,
    ) => {
      mvCalls.push({ txid, vout, blockTag });
      // Each call consumes the next staged balance sheet.
      const sheet = stagedOutpointBalances.shift();
      if (sheet === 'error' || sheet === undefined) {
        throw new Error('protorunesbyoutpoint 524');
      }
      return {
        outpoint: { txid, vout },
        balance_sheet: { cached: { balances: sheet } },
        blockTag,
      };
    },
  ),
}));

import { fetchWalletState, ALKANE_DUST_MAX } from '../fetchWalletState';
import { __resetTipHashCacheForTests } from '../tipHash';

let stagedOutpointBalances: Array<
  Array<{ block: number; tx: number; amount: string }> | 'error'
> = [];

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
  // Per-outpoint balance sheets are consumed in order by the mocked
  // getProtorunesByOutpointMV helper above. Reset so each test starts
  // with a clean queue.
  stagedOutpointBalances = [...opts.outpointBalances];
  mvCalls.length = 0;
  // Track per-address-utxo consumption order. (Outpoint mocking moved
  // to the helper-level mock above; this counter only tracks UTXOs.)
  let addressIdx = 0;

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
    // metashrew_view protorunesbyoutpoint calls are intercepted by the
    // module-level mock above — fetch never sees them. (The per-outpoint
    // wire format has its own coverage in protorunesByOutpointMV.test.ts.)
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

    // Fetch calls: 2 (tip) + 1 (height) + 1 (bitcoind) + 1 (utxo list) = 5.
    // (Per-outpoint protorunes is now via the mocked MV helper — separate counter below.)
    expect(mockFetch).toHaveBeenCalledTimes(5);
    // Exactly ONE per-outpoint helper call — proves the dust filter
    // excluded the over-limit UTXO from the fan-out.
    expect(mvCalls).toHaveLength(1);
    expect(mvCalls[0].vout).toBe(0);
  });

  it('pins per-outpoint reads to the snapshot tip height (reorg safety)', async () => {
    // The whole fan-out MUST use the same blockTag as the captured tip.
    // If individual outpoint reads were 'latest' instead, a block landing
    // mid-fan-out could mix old and new state — the snapshot would not
    // be self-consistent at the tipHash it advertises.
    stageMocks({
      tipHeight: 950_000,
      tipHash: 'feed',
      metashrewHeight: 950_000,
      bitcoindHeight: 950_000,
      addressUtxos: [
        [
          { txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: 949_900 },
          { txid: 'b'.repeat(64), vout: 1, value: 546, blockHeight: 949_950 },
          { txid: 'c'.repeat(64), vout: 2, value: 546, blockHeight: 949_995 },
        ],
      ],
      outpointBalances: [
        [{ block: 2, tx: 0, amount: '10' }],
        [{ block: 2, tx: 0, amount: '20' }],
        [{ block: 2, tx: 0, amount: '30' }],
      ],
    });

    await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(mvCalls).toHaveLength(3);
    for (const c of mvCalls) {
      expect(c.blockTag).toBe('950000');
    }
  });

  it('falls back to blockTag="latest" when metashrew height is 0 (boot or upstream fail)', async () => {
    // If the height probe returns 0 we don't have a usable tip to pin to;
    // 'latest' is the safest fallback — at least the per-outpoint reads
    // are all consistent with whatever metashrew's current tip is at the
    // moment of the call.
    stageMocks({
      tipHeight: 0,
      tipHash: 'cafe',
      metashrewHeight: 0,
      bitcoindHeight: 0,
      addressUtxos: [[{ txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: 1 }]],
      outpointBalances: [[{ block: 2, tx: 0, amount: '1' }]],
    });

    await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(mvCalls).toHaveLength(1);
    expect(mvCalls[0].blockTag).toBe('latest');
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
