/**
 * Server-side wallet-state fan-out.
 *
 * Single entry point that mirrors the subfrost-mobile
 * `fetch_wallet_state_at` flow (upstream.rs:807-869). One call enriches
 * the connected wallet's addresses with:
 *
 *   - confirmed BTC UTXOs (per-address, all addresses fetched in parallel)
 *   - per-dust-UTXO alkane balance sheets (≤1000 sats, the alkanes carrier
 *     threshold — matches subfrost-mobile's `ALKANE_DUST_MAX` constant)
 *   - block-height annotations + per-UTXO confirmation counts computed
 *     against METASHREW's height (NOT bitcoind's). The mismatch is
 *     deliberate: a UTXO at height N+1 when metashrew is still at N
 *     would surface as "spendable" from bitcoind's perspective but the
 *     indexer hasn't seen it yet — spending it produces an
 *     "indexer-sync timed out" failure mid-broadcast. Confirmations
 *     against metashrew let mutation hooks gate on
 *     `filterMetashrewSafe()` before constructing PSBTs.
 *   - tip-hash (used by the API route as part of the Redis cache key)
 *
 * Failure model — match subfrost-mobile (services.rs:247-265): a single
 * failed per-outpoint protorunesbyoutpoint MUST NOT poison the whole
 * fanout (one dust UTXO out of 100 returning 524 used to zero the entire
 * cache and surface as "Insufficient alkanes: have 0"). `Promise.allSettled`
 * collects what it can and the API route's last-good-redis fallback
 * stitches up the rest from the previous block's cache entry.
 */

import { getAddressUtxos, getHeight } from '@/lib/alkanes/rpc';
import { getProtorunesByOutpointMV } from '@/lib/alkanes/protorunesByOutpointMV';
import { getRpcUrl } from '@/utils/getConfig';
import { getCurrentTipHash } from './tipHash';

/**
 * Thrown when one or more per-outpoint protorune fanouts fail mid-way.
 * The route layer catches this and falls back to the last-good cached
 * snapshot instead of caching a partial (silently-wrong) result.
 * Always-eventually-correct: as soon as the per-outpoint reads
 * stabilise on a subsequent request, the cache populates with a
 * complete snapshot.
 */
export class PartialFanoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartialFanoutError';
  }
}

import {
  withPendingAdjustment,
  type MempoolAdjustmentReport,
} from './applyMempoolAdjustment';
import type { PendingTxStore } from './pendingTxStorePort';

/** Dust threshold — alkanes always live in ≤ 1000-sat outputs by the
 *  subfrost convention (matches subfrost-mobile `ALKANE_DUST_MAX`). */
export const ALKANE_DUST_MAX = 1000;

export interface WalletUtxoAlkane {
  block: number;
  tx: number;
  amount: string;
}

export interface WalletUtxo {
  txid: string;
  vout: number;
  value: number;
  address: string;
  scriptPubKeyHex?: string;
  /**
   * Block height the UTXO was mined at, or `null` for mempool UTXOs.
   * Used by `filterMetashrewSafe` to gate spend decisions: a UTXO
   * with `blockHeight > metashrewHeight` is not yet indexed and must
   * not be selected for any tx that requires alkane state.
   */
  blockHeight: number | null;
  /**
   * Confirmations measured AGAINST METASHREW's height (not bitcoind's).
   * 0 = mempool or not-yet-indexed. >=1 = metashrew has processed the
   * block that contains this UTXO.
   */
  confirmations: number;
  /** Per-outpoint alkane balance sheet. Empty for non-dust BTC change. */
  alkanes: WalletUtxoAlkane[];
  /**
   * `true` when the UTXO was synthesised from a broadcast-but-unconfirmed
   * pending mempool tx (`withPendingAdjustment`), rather than read from
   * the indexer's confirmed UTXO set. Pending UTXOs ALWAYS carry
   * `alkanes: []` regardless of value — we never trust mempool alkane
   * provenance (see `applyMempoolAdjustment.ts`).
   *
   * Optional/omitted on confirmed entries — only the pending-chain-spend
   * path sets this.
   */
  isPending?: boolean;
}

export interface WalletStateBtcSats {
  /** Sats held in non-taproot (segwit) addresses. */
  p2wpkh: number;
  /** Sats held in taproot addresses. */
  p2tr: number;
  /** All BTC across every UTXO, regardless of address type. */
  total: number;
  /**
   * Spendable BTC — sats in non-dust UTXOs that are also confirmed
   * against metashrew (`confirmations >= 1`). Mutation hooks use this
   * as the soft-cap for fee budgets.
   */
  spendable: number;
}

export interface WalletState {
  addresses: string[];
  metashrewHeight: number;
  bitcoindHeight: number;
  tipHash: string;
  utxos: WalletUtxo[];
  btcSats: WalletStateBtcSats;
  /** Aggregate per-alkane balance keyed by "block:tx". */
  alkanes: Record<string, string>;
  /**
   * Populated only when `fetchWalletState` is called with
   * `{ includePending: true }`. Counts of UTXOs stripped (confirmed
   * outpoints spent by a pending tx) and added (pending outputs paying
   * our addresses, treated as fresh spendable BTC). Useful for
   * observability — e.g. logging "wallet view stitched: stripped 1,
   * added 2 pending".
   */
  pendingAdjustment?: MempoolAdjustmentReport;
}

/**
 * Network names recognised by the per-outpoint helpers AND by
 * `applyMempoolAdjustment`. Cast through this once at the entry point
 * so the rest of the pipeline doesn't have to re-narrow.
 */
function networkBucket(network: string): 'mainnet' | 'signet' | 'regtest' {
  if (network.includes('regtest') || network === 'devnet') return 'regtest';
  if (network === 'signet' || network === 'testnet') return 'signet';
  return 'mainnet';
}

export interface FetchWalletStateOptions {
  /**
   * When `true`, stitch the wallet's own broadcast-but-unconfirmed
   * mempool transactions into the returned UTXO set:
   *   - strip confirmed UTXOs at any prevout spent by a pending tx
   *     (closes the `bad-txns-spends-conflicting-tx` window),
   *   - add pending outputs paying our addresses as fresh
   *     `confirmations: 0, isPending: true, alkanes: []` entries.
   *
   * Defaults to `false` to keep the route path 100% backward-compatible
   * with the original confirmed-only snapshot.
   *
   * Wiring this on for the live wallet UI requires a `pendingTxStore`
   * accessible from the server route (IndexedDB is browser-only); the
   * current implementation accepts an injected store so the API route
   * can opt in once we plumb a server-side or request-bound store.
   */
  includePending?: boolean;
  /**
   * Concrete store implementation. Must be provided when
   * `includePending: true`. The route layer can build an ad-hoc store
   * from request-body-supplied tx hexes; tests inject a memory store.
   */
  pendingTxStore?: PendingTxStore;
}

/** True for any address-string that looks like a taproot output. */
function isTaprootAddress(addr: string): boolean {
  // Mainnet `bc1p`, testnet `tb1p`, regtest `bcrt1p`, signet `tb1p`.
  // P2TR is always bech32m with witness version 1, so the `1p` infix is
  // load-bearing — `bc1q…` (P2WPKH) is segwit; `bc1p…` (P2TR) is taproot.
  return /^(bc1p|tb1p|bcrt1p)/.test(addr);
}

async function fetchBitcoindHeight(network: string): Promise<number> {
  try {
    const res = await fetch(getRpcUrl(network), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'esplora_blocks::tip:height',
        params: [],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return Number(json?.result ?? 0) || 0;
  } catch {
    return 0;
  }
}

/**
 * Fan out the wallet's per-address UTXO list and per-outpoint alkane
 * balances. Returns a single `WalletState` snapshot the API route can
 * serialize to JSON and stash in Redis.
 *
 * Throws when `addresses` is empty so the route layer surfaces a 400 —
 * an empty address list yields an empty snapshot and would silently
 * cache "wallet has nothing" forever.
 */
export async function fetchWalletState(
  network: string,
  addresses: string[],
  options: FetchWalletStateOptions = {},
): Promise<WalletState> {
  if (addresses.length === 0) {
    throw new Error('fetchWalletState: addresses must be non-empty');
  }

  // Heights + tip hash in parallel — none of them depend on the per-
  // address fanout, so we don't pay their latency on the critical path.
  const [tipHash, metashrewHeightRaw, bitcoindHeight] = await Promise.all([
    getCurrentTipHash(network),
    getHeight(network).catch(() => 0),
    fetchBitcoindHeight(network),
  ]);
  const metashrewHeight = Number(metashrewHeightRaw) || 0;

  // Per-address UTXO fetch, in parallel. Failures are tolerated per
  // address — one degraded esplora response shouldn't zero out the
  // entire wallet snapshot.
  const utxoSettled = await Promise.allSettled(
    addresses.map(async (addr) => {
      const list = await getAddressUtxos(network, addr, AbortSignal.timeout(15_000));
      return list.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        address: addr,
        blockHeight: u.status?.block_height ?? null,
        // Mempool entries (`status.confirmed === false` or undefined
        // block_height) become `blockHeight: null` so the safe-spend
        // filter excludes them.
      }));
    }),
  );

  const rawUtxos: Array<{
    txid: string;
    vout: number;
    value: number;
    address: string;
    blockHeight: number | null;
  }> = [];
  let failedAddresses = 0;
  for (const r of utxoSettled) {
    if (r.status === 'fulfilled') {
      rawUtxos.push(...r.value);
    } else {
      failedAddresses += 1;
    }
  }
  if (failedAddresses > 0) {
    console.warn(
      `[walletState] ${failedAddresses}/${addresses.length} address UTXO fetches failed for network=${network}`,
    );
  }

  // Dust probe — alkane balances live on outpoints ≤ ALKANE_DUST_MAX.
  // Index by `txid:vout` so we can splice balance sheets back in
  // without an O(N²) lookup.
  const dustOutpoints = rawUtxos.filter((u) => u.value <= ALKANE_DUST_MAX);
  const balanceSheets = new Map<string, WalletUtxoAlkane[]>();

  if (dustOutpoints.length > 0) {
    // Pin every per-outpoint read to the SAME metashrew height as the
    // snapshot's tipHash so the fan-out is reorg-safe and a block landing
    // mid-fan-out can't return mixed state. `'latest'` would let metashrew
    // return whatever its current tip is at each call — fine in steady
    // state, racy across the boundary. Using the canonical
    // `metashrew_view protorunesbyoutpoint` primitive via the MV helper
    // because the legacy `alkanes_protorunesbyoutpoint` JSON-RPC wrapper
    // is "Method not found" on the in-cluster jsonrpc upstream (verified
    // 2026-05-11 in subfrost-mobile upstream.rs:646; same risk surface
    // here on any deployment that routes through jsonrpc.mainnet-alkanes).
    const blockTag = metashrewHeight > 0 ? metashrewHeight.toString() : 'latest';
    const settled = await Promise.allSettled(
      dustOutpoints.map(async (u) => {
        const resp = await getProtorunesByOutpointMV(
          network,
          u.txid,
          u.vout,
          blockTag,
          1n,
          AbortSignal.timeout(15_000),
        );
        const balances = resp?.balance_sheet?.cached?.balances ?? [];
        const cleaned: WalletUtxoAlkane[] = [];
        for (const b of balances) {
          const amount = String(b.amount ?? '0');
          if (amount === '0') continue;
          cleaned.push({
            block: Number(b.block),
            tx: Number(b.tx),
            amount,
          });
        }
        return { key: `${u.txid}:${u.vout}`, alkanes: cleaned };
      }),
    );
    let failedFanouts = 0;
    const failedOutpoints: string[] = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      if (r.status === 'fulfilled') {
        balanceSheets.set(r.value.key, r.value.alkanes);
      } else {
        failedFanouts += 1;
        const u = dustOutpoints[i];
        failedOutpoints.push(`${u.txid}:${u.vout}`);
      }
    }
    if (failedFanouts > 0) {
      // 2026-05-18 mork1e regression: previously this logged a warning
      // and returned the partial state, which got cached in Redis under
      // the current tipHash AND overwrote the last-good snapshot. The
      // app then displayed "0 TORTILLA / 0 DIESEL" until the next block
      // even though only ONE of mork's dust outpoints had failed the
      // protorune fanout. The harness (scripts/verify-display-mainnet.ts)
      // I1 invariant catches this class.
      //
      // New behavior: throw a PartialFanoutError so the API route's
      // catch fires last-good fallback (returns the previous COMPLETE
      // snapshot instead of caching the incomplete one). Eventually-
      // correct as soon as the per-outpoint reads stabilise.
      throw new PartialFanoutError(
        `per-outpoint protorune fanout failed for ${failedFanouts}/${dustOutpoints.length} dust UTXOs ` +
        `on network=${network}: ${failedOutpoints.slice(0, 5).join(', ')}` +
        `${failedOutpoints.length > 5 ? ` (+ ${failedOutpoints.length - 5} more)` : ''}`,
      );
    }
  }

  // Assemble the final UTXO list with annotations + alkane balances.
  const confirmedUtxos: WalletUtxo[] = rawUtxos.map((u) => {
    const confirmations =
      u.blockHeight === null || metashrewHeight === 0
        ? 0
        : Math.max(0, metashrewHeight - u.blockHeight + 1);
    return {
      txid: u.txid,
      vout: u.vout,
      value: u.value,
      address: u.address,
      blockHeight: u.blockHeight,
      confirmations,
      alkanes: balanceSheets.get(`${u.txid}:${u.vout}`) ?? [],
      isPending: false,
    };
  });

  // Pending-tx-aware adjustment — opt-in via `options.includePending`.
  // Runs AFTER per-outpoint enrichment so the protorune fan-out only
  // touches outpoints we actually have alkane state for (pending
  // outputs carry `alkanes: []` by construction — see
  // `applyMempoolAdjustment.ts`), and BEFORE the final aggregation so
  // the BTC totals reflect the post-pending view the caller asked for.
  let utxos: WalletUtxo[] = confirmedUtxos;
  let pendingAdjustment: MempoolAdjustmentReport | undefined;
  if (options.includePending && options.pendingTxStore) {
    const result = await withPendingAdjustment(
      confirmedUtxos,
      addresses,
      networkBucket(network),
      options.pendingTxStore,
    );
    utxos = result.utxos;
    pendingAdjustment = result.report;
    if (pendingAdjustment.stripped > 0 || pendingAdjustment.added > 0) {
      console.info(
        `[walletState] pending adjustment: stripped=${pendingAdjustment.stripped}, added=${pendingAdjustment.added}`,
      );
    }
  }

  // Aggregate BTC sats by address type + alkane totals by (block, tx).
  let p2wpkh = 0;
  let p2tr = 0;
  let spendable = 0;
  const alkaneTotals = new Map<string, bigint>();
  for (const u of utxos) {
    if (isTaprootAddress(u.address)) p2tr += u.value;
    else p2wpkh += u.value;
    // `spendable` gates on BITCOIND confirmation (blockHeight !== null),
    // NOT metashrew confirmation. Metashrew-lag must not gate BTC spending.
    //
    // 2026-05-17 mork1e IMG_2439 regression: previously gated on
    // `confirmations >= 1` where `confirmations = metashrewHeight - blockHeight + 1`.
    // When metashrew lagged bitcoind by even 1 block, fresh BTC UTXOs
    // (confirmed by miners, indexed by esplora) silently got
    // `confirmations = 0` and dropped from spendable → wallet showed
    // "Insufficient BTC: need 12 sats" with 19,035 confirmed sats present.
    // Concrete: UTXO at block 949860, metashrew at 949858 → spendable=0.
    //
    // Pending-adjustment outputs still don't count (their blockHeight is
    // null by construction in applyMempoolAdjustment.ts), preserving the
    // original "don't trust optimistic mempool sats for fee budget" intent.
    //
    // Alkane-aware mutation hooks that need the indexer caught up before
    // selecting a UTXO should filter against `u.confirmations >= 1`
    // directly (uses metashrewHeight) — that's a separate gate from BTC
    // spendability and a different consumer.
    if (u.blockHeight !== null && u.value > ALKANE_DUST_MAX) {
      spendable += u.value;
    }
    for (const a of u.alkanes) {
      const key = `${a.block}:${a.tx}`;
      alkaneTotals.set(key, (alkaneTotals.get(key) ?? 0n) + BigInt(a.amount));
    }
  }

  const alkanes: Record<string, string> = {};
  for (const [id, amount] of alkaneTotals.entries()) {
    if (amount > 0n) alkanes[id] = amount.toString();
  }

  return {
    addresses,
    metashrewHeight,
    bitcoindHeight,
    tipHash,
    utxos,
    btcSats: {
      p2wpkh,
      p2tr,
      total: p2wpkh + p2tr,
      spendable,
    },
    alkanes,
    ...(pendingAdjustment ? { pendingAdjustment } : {}),
  };
}
