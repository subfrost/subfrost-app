/**
 * Reproduce: dual-address browser wallets (Xverse / Leather / OYL) with
 * BTC at the TAPROOT address show "0 BTC" in the wallet header even
 * though the taproot has clean (non-dust) BTC.
 *
 * Real example: bc1psn0925c2p5mjnvkg0xkntpd26wtcyktmwt3shuw7ue04yed5sjfs7xwmj4
 * has 213,263 sats of clean BTC plus 11 alkane-carrying dust UTXOs at
 * the taproot. `btcBalanceFastQueryOptions.queryFn` was only fetching
 * UTXOs for the segwit (payment) address, so `btcFast.p2tr` was always
 * 0 for dual-address wallets and the displayed "total" came back 0.
 *
 * The fix: query both segwit AND taproot for dual-address wallets so
 * `btcFast.total` reflects the wallet's actual BTC. `spendable` keeps
 * the existing protect_taproot semantics (segwit-only on dual wallets,
 * total on single-address) so the swap form's input cap doesn't change.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { btcBalanceFastQueryOptions } from '../account';

const TAPROOT = 'bc1psn0925c2p5mjnvkg0xkntpd26wtcyktmwt3shuw7ue04yed5sjfs7xwmj4';
const SEGWIT = 'bc1qexampleemptypaymentaddress0000000';

// Snapshot from blockstream for the real address (2026-05-15):
//   6 non-dust BTC UTXOs = 213,263 sats
//   11 dust alkane UTXOs (546 each) = 6,006 sats
//   Total = 219,269 sats at the taproot, segwit = 0.
const TAPROOT_UTXOS = [
  { txid: 'a', vout: 0, value: 9_771,  status: { confirmed: true, block_height: 949_428 } },
  { txid: 'b', vout: 0, value: 27_999, status: { confirmed: true, block_height: 949_433 } },
  { txid: 'c', vout: 0, value: 89_000, status: { confirmed: true, block_height: 949_433 } },
  { txid: 'd', vout: 0, value: 59_999, status: { confirmed: true, block_height: 949_433 } },
  { txid: 'e', vout: 3, value: 21_719, status: { confirmed: true, block_height: 949_428 } },
  { txid: 'f', vout: 0, value: 4_775,  status: { confirmed: true, block_height: 949_389 } },
  ...Array.from({ length: 11 }, (_, i) => ({
    txid: `dust${i}`, vout: 1, value: 546,
    status: { confirmed: true, block_height: 949_433 },
  })),
];
const TAPROOT_TOTAL = 219_269;

type FetchInit = { method?: string; body?: string };

/** Derive chain_stats from a fixture UTXO list (all assumed unspent). */
function statsFromUtxos(utxos: Array<{ value: number }>, mempoolFunded = 0, mempoolSpent = 0) {
  return {
    chain_stats: {
      funded_txo_sum: utxos.reduce((s, u) => s + u.value, 0),
      spent_txo_sum: 0,
      funded_txo_count: utxos.length,
      spent_txo_count: 0,
      tx_count: utxos.length,
    },
    mempool_stats: {
      funded_txo_sum: mempoolFunded,
      spent_txo_sum: mempoolSpent,
      funded_txo_count: mempoolFunded > 0 ? 1 : 0,
      spent_txo_count: mempoolSpent > 0 ? 1 : 0,
      tx_count: 0,
    },
  };
}

/**
 * Stub the /api/rpc transport. Supports both endpoints fetchAddressBalance
 * has historically used:
 *   - `esplora_address` (current) → stats with chain_stats + mempool_stats
 *   - `esplora_address::utxo` (legacy, kept for any test still on the
 *     gross-UTXO-list shape) → array of UTXO objects
 *
 * For `esplora_address`, optional perAddressMempool maps a per-address
 * { funded, spent } pair to drive mempool_stats independently of the
 * confirmed UTXO list (mork's IMG screenshot regression).
 */
function stubEsploraFetch(
  perAddressUtxos: Record<string, Array<{ value: number; [k: string]: unknown }>>,
  perAddressMempool: Record<string, { funded: number; spent: number }> = {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: FetchInit) => {
      const body = JSON.parse(init.body ?? '{}');
      const addr = body?.params?.[0] as string | undefined;
      const method = body?.method as string | undefined;
      const utxos = (addr && perAddressUtxos[addr]) ?? [];
      let result: unknown;
      if (method === 'esplora_address') {
        const mp = (addr && perAddressMempool[addr]) ?? { funded: 0, spent: 0 };
        result = statsFromUtxos(utxos, mp.funded, mp.spent);
      } else {
        result = utxos;
      }
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: body?.id ?? 1, result }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('btcBalanceFastQueryOptions — dual-address taproot BTC visibility', () => {
  it('includes taproot BTC in total for dual-address browser wallets', async () => {
    const account = {
      nativeSegwit: { address: SEGWIT, pubkey: '', hdPath: '' },
      taproot: { address: TAPROOT, pubkey: '', pubKeyXOnly: '', hdPath: '' },
      paymentAddress: SEGWIT,
      payerAddress: SEGWIT,
    };

    stubEsploraFetch({ [TAPROOT]: TAPROOT_UTXOS, [SEGWIT]: [] });

    const opts = btcBalanceFastQueryOptions({
      account,
      isConnected: true,
      network: 'mainnet',
      walletType: 'browser',
    });
    const balance = await opts.queryFn!({} as never);

    // The header reads `btcFast.total` (or `p2tr` directly on dual-address
    // wallets) — both must reflect what the user actually holds.
    expect(balance.p2tr).toBe(TAPROOT_TOTAL);
    expect(balance.total).toBe(TAPROOT_TOTAL);
    // protect_taproot=true on dual-address wallets: spendable for fees
    // stays 0 (segwit has no BTC). This preserves the swap input cap.
    expect(balance.spendable).toBe(0);
  });

  it('shows total BTC for single-address (taproot-only) wallets', async () => {
    const account = {
      nativeSegwit: undefined,
      taproot: { address: TAPROOT, pubkey: '', pubKeyXOnly: '', hdPath: '' },
      paymentAddress: undefined,
      payerAddress: undefined,
    };

    stubEsploraFetch({ [TAPROOT]: TAPROOT_UTXOS });

    const opts = btcBalanceFastQueryOptions({
      account,
      isConnected: true,
      network: 'mainnet',
      walletType: 'keystore',
    });
    const balance = await opts.queryFn!({} as never);

    expect(balance.p2tr).toBe(TAPROOT_TOTAL);
    expect(balance.total).toBe(TAPROOT_TOTAL);
    // Single-address wallets spend their only address — full balance is
    // available for fees.
    expect(balance.spendable).toBe(TAPROOT_TOTAL);
  });

  it('counts segwit BTC as spendable on dual-address wallets', async () => {
    const account = {
      nativeSegwit: { address: SEGWIT, pubkey: '', hdPath: '' },
      taproot: { address: TAPROOT, pubkey: '', pubKeyXOnly: '', hdPath: '' },
      paymentAddress: SEGWIT,
      payerAddress: SEGWIT,
    };

    stubEsploraFetch({
      [SEGWIT]: [
        { txid: 'g', vout: 0, value: 100_000, status: { confirmed: true, block_height: 949_440 } },
      ],
      [TAPROOT]: TAPROOT_UTXOS,
    });

    const opts = btcBalanceFastQueryOptions({
      account,
      isConnected: true,
      network: 'mainnet',
      walletType: 'browser',
    });
    const balance = await opts.queryFn!({} as never);

    expect(balance.p2wpkh).toBe(100_000);
    expect(balance.p2tr).toBe(TAPROOT_TOTAL);
    expect(balance.total).toBe(100_000 + TAPROOT_TOTAL);
    expect(balance.spendable).toBe(100_000);
  });
});

// ---------------------------------------------------------------------------
// mork1e 2026-05-17 FB6 regression: pending was 0.0001 BTC actual but app
// showed 0.0006 BTC. Previous fetchAddressBalance used
// esplora_address::utxo and summed mempool UTXO values — only counted
// INCOMING mempool outputs, ignored confirmed UTXOs being SPENT in
// mempool. Fix: use esplora_address (stats endpoint) and compute NET
// pending from mempool_stats.funded_txo_sum - spent_txo_sum.
// ---------------------------------------------------------------------------
describe('btcBalanceFastQueryOptions — net mempool pending (mork1e)', () => {
  const SINGLE_ADDR = 'bc1psn0925c2p5mjnvkg0xkntpd26wtcyktmwt3shuw7ue04yed5sjfs7xwmj4';
  const account = {
    nativeSegwit: undefined,
    taproot: { address: SINGLE_ADDR, pubkey: '', pubKeyXOnly: '', hdPath: '' },
    paymentAddress: undefined,
    payerAddress: undefined,
  };

  it('net pending: incoming > outgoing reports pendingIn = net', async () => {
    // 100k confirmed; pending tx funds 30k AND spends 5k -> net pending +25k.
    stubEsploraFetch(
      { [SINGLE_ADDR]: [{ value: 100_000, status: { confirmed: true, block_height: 949_900 } }] },
      { [SINGLE_ADDR]: { funded: 30_000, spent: 5_000 } },
    );
    const balance = await btcBalanceFastQueryOptions({
      account, isConnected: true, network: 'mainnet', walletType: 'keystore',
    }).queryFn!({} as never);
    expect(balance.pendingIn).toBe(25_000);
    expect(balance.pendingOut).toBe(0);
  });

  it('mork scenario: pending tx spends more than it funds -> pendingOut populated, pendingIn = 0', async () => {
    // Confirmed 100k; pending tx spends a confirmed 60k UTXO and creates
    // a 50k change output back -> mempool_stats: funded=50k, spent=60k.
    // Old code returned pendingIn = 50k (gross incoming, false alarm).
    // New code: net mempool = funded - spent = -10k -> pendingOut=10k.
    stubEsploraFetch(
      { [SINGLE_ADDR]: [{ value: 100_000, status: { confirmed: true, block_height: 949_900 } }] },
      { [SINGLE_ADDR]: { funded: 50_000, spent: 60_000 } },
    );
    const balance = await btcBalanceFastQueryOptions({
      account, isConnected: true, network: 'mainnet', walletType: 'keystore',
    }).queryFn!({} as never);
    expect(balance.pendingIn).toBe(0);
    expect(balance.pendingOut).toBe(10_000);
  });

  it('no mempool activity: both pending fields are 0', async () => {
    stubEsploraFetch(
      { [SINGLE_ADDR]: [{ value: 100_000, status: { confirmed: true, block_height: 949_900 } }] },
      { [SINGLE_ADDR]: { funded: 0, spent: 0 } },
    );
    const balance = await btcBalanceFastQueryOptions({
      account, isConnected: true, network: 'mainnet', walletType: 'keystore',
    }).queryFn!({} as never);
    expect(balance.pendingIn).toBe(0);
    expect(balance.pendingOut).toBe(0);
  });
});
