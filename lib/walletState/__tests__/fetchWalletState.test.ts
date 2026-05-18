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
    if (method === 'esplora_address') {
      // Empty mempool_stats — tests don't exercise pending-BTC paths via
      // this mock layer. Returning a well-formed but zeroed payload keeps
      // the call from throwing 'unexpected RPC method' and lets fetchWalletState
      // populate pendingIn/pendingOut as 0.
      return rpcResult({
        address: 'test',
        chain_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0 },
        mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0 },
      }) as Response;
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

    // Fetch calls: 2 (tip) + 1 (height) + 1 (bitcoind) + 1 (utxo list) + 1 (esplora_address stats) = 6.
    // (Per-outpoint protorunes is now via the mocked MV helper — separate counter below.)
    expect(mockFetch).toHaveBeenCalledTimes(6);
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

  // ---------------------------------------------------------------------------
  // 2026-05-18 mork1e regression: per-outpoint protorune fanout partial
  // failures were silently returning incomplete state which got cached
  // under the current tipHash AND overwrote the last-good snapshot. Mork's
  // wallet showed "0 TORTILLA / 0 DIESEL" for hours because ONE of his dust
  // outpoints' fanout failed and the partial-empty state got persisted.
  // verify-display-mainnet.ts I1 invariant catches this; the fix throws
  // PartialFanoutError so the route falls back to last-good (complete)
  // instead of caching the partial.
  // ---------------------------------------------------------------------------
  it('throws PartialFanoutError on per-outpoint failure (no silent partial state)', async () => {
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
        'error', // first outpoint fails the per-outpoint probe
        [{ block: 2, tx: 0, amount: '7000' }],
      ],
    });

    await expect(fetchWalletState('mainnet', [TAPROOT_ADDR])).rejects.toThrow(
      /PartialFanoutError|per-outpoint protorune fanout failed/,
    );
  });

  it('throws PartialFanoutError surfaces failed outpoint ids', async () => {
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
      outpointBalances: ['error', 'error'],
    });

    await expect(fetchWalletState('mainnet', [TAPROOT_ADDR])).rejects.toThrow(
      /aaaaa|bbbbb/, // at least one of the failed outpoint ids appears
    );
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

  // -------------------------------------------------------------------------
  // mork1e IMG_2439 regression (2026-05-17): "Insufficient BTC balance.
  // Need 0.000012 BTC for this transaction" — but wallet had 19,035 sats
  // present and confirmed in bitcoind. Root cause: spendable gate used
  // metashrewHeight-based `confirmations >= 1`, so when metashrew lagged
  // bitcoind by even 1 block, fresh BTC UTXOs got `confirmations = 0` and
  // were silently dropped from spendable.
  //
  // Fix: gate spendable on bitcoind confirmation (`blockHeight !== null`).
  // Metashrew lag shouldn't gate BTC spending — it's the alkane indexer,
  // not the BTC indexer. Alkane-aware mutation hooks that need indexer
  // catch-up before selecting a UTXO can still filter on
  // `u.confirmations >= 1` directly.
  // -------------------------------------------------------------------------
  it('BTC spendable: includes UTXOs confirmed in bitcoind even when metashrew lags (mork1e IMG_2439)', async () => {
    // Mock infra returns opts.tipHeight for the metashrew_height RPC
    // (used by both getCurrentTipHash and getHeight in fetchWalletState),
    // so metashrewHeight inside the impl ends up at `tipHeight`. To
    // simulate "metashrew 2 blocks behind bitcoind", set tipHeight to
    // the lower value and bitcoindHeight to the higher.
    stageMocks({
      tipHeight: 949858,         // metashrew at 949858
      tipHash: 'cafe',
      metashrewHeight: 949858,   // (declarative — not actually consumed by mock)
      bitcoindHeight: 949860,    // bitcoind at 949860 (2 blocks ahead)
      addressUtxos: [
        [
          // The exact mork scenario: 19,035-sat UTXO confirmed at block
          // 949860 (above metashrew's 949858 → old gate would set
          // confirmations=0 → spendable=0 → "Insufficient BTC" panic).
          { txid: 'a'.repeat(64), vout: 0, value: 19_035, blockHeight: 949860 },
        ],
      ],
      outpointBalances: [],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    // confirmations stays metashrew-gated (used by alkane paths) — still 0
    expect(state.utxos[0].confirmations).toBe(0);
    // ...but spendable now counts the UTXO because it IS confirmed in bitcoind
    expect(state.btcSats.spendable).toBe(19_035);
    expect(state.btcSats.total).toBe(19_035);
  });

  it('BTC spendable: still excludes mempool (no block_height) and dust', async () => {
    stageMocks({
      tipHeight: 100,
      tipHash: 'cafe',
      metashrewHeight: 100,
      bitcoindHeight: 100,
      addressUtxos: [
        [
          // Confirmed dust — excluded because <= ALKANE_DUST_MAX (alkane carrier).
          { txid: 'a'.repeat(64), vout: 0, value: 546, blockHeight: 99 },
          // Confirmed non-dust — included.
          { txid: 'b'.repeat(64), vout: 0, value: 10_000, blockHeight: 99 },
          // Mempool (blockHeight=null) — excluded.
          { txid: 'c'.repeat(64), vout: 0, value: 5_000, blockHeight: null },
        ],
      ],
      outpointBalances: [
        [{ block: 2, tx: 0, amount: '100' }],
        [],
        [],
      ],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);

    expect(state.btcSats.total).toBe(15_546);  // sum of all
    expect(state.btcSats.spendable).toBe(10_000); // only the confirmed non-dust
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

  // ---------------------------------------------------------------------
  // includePending — pending-tx chain-spend stitching opt-in
  // ---------------------------------------------------------------------
  it('includePending: false (default) leaves the response unchanged', async () => {
    stageMocks({
      tipHeight: 1,
      tipHash: 'cafe',
      metashrewHeight: 1,
      bitcoindHeight: 1,
      addressUtxos: [
        [{ txid: 'a'.repeat(64), vout: 0, value: 50_000, blockHeight: 1 }],
      ],
      outpointBalances: [],
    });

    const state = await fetchWalletState('mainnet', [TAPROOT_ADDR]);
    expect(state.pendingAdjustment).toBeUndefined();
    expect(state.utxos).toHaveLength(1);
  });

  it('includePending: true stitches pending outputs as fresh spendable BTC', async () => {
    // Build a real synthetic tx that spends prev:0 and creates new:0
    // paying our taproot address. The decoder is exercised end-to-end
    // (raw hex → mempool payload → adjustment).
    //
    // Note: the test wallet's TAPROOT_ADDR is a synthesised bech32m
    // string we use as a label — the synthetic tx pays a DIFFERENT
    // (real, network-valid) address we then list as an owned address.
    // The point of the test is to prove the end-to-end stitching works,
    // not to round-trip the test fixture's TAPROOT_ADDR.
    const bitcoin = await import('bitcoinjs-lib');
    const prevTxid =
      'aa00000000000000000000000000000000000000000000000000000000000000';
    const spk = Buffer.concat([
      Buffer.from([0x00, 0x14]),
      Buffer.from('1234567890abcdef1234567890abcdef12345678', 'hex'),
    ]);
    const ourAddr = bitcoin.address.fromOutputScript(
      spk,
      bitcoin.networks.bitcoin,
    );
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    psbt.addInput({
      hash: prevTxid,
      index: 0,
      witnessUtxo: { script: spk, value: BigInt(100_000) },
    });
    psbt.addOutput({ script: spk, value: BigInt(99_500) });
    const tx = (psbt as unknown as { __CACHE: { __TX: import('bitcoinjs-lib').Transaction } }).__CACHE.__TX;
    const pendingHex = tx.toHex();
    const pendingTxid = tx.getId();

    stageMocks({
      tipHeight: 100,
      tipHash: 'feed',
      metashrewHeight: 100,
      bitcoindHeight: 100,
      addressUtxos: [
        // Indexer still sees prev:0 as confirmed because it hasn't
        // processed the pending tx yet — this is the production race
        // condition the adjustment fixes.
        [{ txid: prevTxid, vout: 0, value: 100_000, blockHeight: 99 }],
      ],
      outpointBalances: [], // not dust → no fan-out
    });

    const store: import('../pendingTxStorePort').PendingTxStore = {
      list: async () => [pendingHex],
    };

    const state = await fetchWalletState('mainnet', [ourAddr], {
      includePending: true,
      pendingTxStore: store,
    });

    // Report populated.
    expect(state.pendingAdjustment).toEqual({ stripped: 1, added: 1 });

    // The confirmed prev:0 was stripped, the pending new:0 added.
    expect(state.utxos).toHaveLength(1);
    expect(state.utxos[0].txid).toBe(pendingTxid);
    expect(state.utxos[0].vout).toBe(0);
    expect(state.utxos[0].value).toBe(99_500);
    expect(state.utxos[0].isPending).toBe(true);
    expect(state.utxos[0].confirmations).toBe(0);
    expect(state.utxos[0].alkanes).toEqual([]); // load-bearing safety
    expect(state.utxos[0].blockHeight).toBe(null);

    // btcSats: total reflects the pending output, but `spendable`
    // (which gates on confirmations >= 1) deliberately excludes it
    // so risk-averse callers can opt out.
    expect(state.btcSats.total).toBe(99_500);
    expect(state.btcSats.spendable).toBe(0);
  });
});
