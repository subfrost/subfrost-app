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

import {
  getAddressUtxos,
  getProtorunesByOutpoint,
  getHeight,
} from '@/lib/alkanes/rpc';
import { getRpcUrl } from '@/utils/getConfig';
import { getCurrentTipHash } from './tipHash';

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
    const settled = await Promise.allSettled(
      dustOutpoints.map(async (u) => {
        const resp = await getProtorunesByOutpoint(
          network,
          u.txid,
          u.vout,
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
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        balanceSheets.set(r.value.key, r.value.alkanes);
      } else {
        failedFanouts += 1;
      }
    }
    if (failedFanouts > 0) {
      console.warn(
        `[walletState] ${failedFanouts}/${dustOutpoints.length} per-outpoint fanouts failed for network=${network}`,
      );
    }
  }

  // Assemble the final UTXO list with annotations + alkane balances.
  const utxos: WalletUtxo[] = rawUtxos.map((u) => {
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
    };
  });

  // Aggregate BTC sats by address type + alkane totals by (block, tx).
  let p2wpkh = 0;
  let p2tr = 0;
  let spendable = 0;
  const alkaneTotals = new Map<string, bigint>();
  for (const u of utxos) {
    if (isTaprootAddress(u.address)) p2tr += u.value;
    else p2wpkh += u.value;
    if (u.confirmations >= 1 && u.value > ALKANE_DUST_MAX) {
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
  };
}
