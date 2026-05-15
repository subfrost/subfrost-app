/**
 * Account / wallet query options.
 *
 * - enrichedWallet: BTC UTXOs + runes (was useEffect, now useQuery)
 * - alkaneBalances: alkane token balances via SDK data API (separate query)
 * - btcBalance: spendable BTC satoshis
 * - sellableCurrencies: alkane tokens the wallet holds
 *
 * JOURNAL ENTRY (2026-02-03):
 * Fixed alkanes not loading on wallet dashboard. The Subfrost API returns alkane
 * balances in a different format than the SDK TypeScript types expect:
 *   - API returns { data: [...], statusCode: 200 }, SDK expects { alkanes: [...] }
 *   - API items have `balance` and `alkaneId: {block,tx}`, SDK expects `amount` and `id`
 * Changed to check both: `result.alkanes || result.data` and `entry.amount || entry.balance`.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { getRpcUrl } from '@/utils/getConfig';
import {
  getAddressMempoolTxs,
  getAddressUtxos,
  getAlkaneInfoBatch,
  getEsploraTx,
  getProtorunesByOutpoint,
} from '@/lib/alkanes/rpc';
import { getAlkanesDataSource } from '@/lib/alkanes/dataSource';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

type WalletBalanceAccount = {
  nativeSegwit?: { address?: string };
  taproot?: { address?: string };
  paymentAddress?: string;
  payerAddress?: string;
  payment?: { address?: string };
} | null | undefined;

export function getWalletBalanceAddresses(account: WalletBalanceAccount): string[] {
  const addresses = [
    account?.nativeSegwit?.address,
    account?.paymentAddress,
    account?.payerAddress,
    account?.payment?.address,
    account?.taproot?.address,
  ].filter((address): address is string => typeof address === 'string' && address.length > 0);

  return Array.from(new Set(addresses));
}

export function getWalletBtcBalanceAddresses(account: WalletBalanceAccount): string[] {
  const paymentAddresses = [
    account?.nativeSegwit?.address,
    account?.paymentAddress,
    account?.payerAddress,
    account?.payment?.address,
  ].filter((address): address is string => typeof address === 'string' && address.length > 0);

  const uniquePaymentAddresses = Array.from(new Set(paymentAddresses));
  if (uniquePaymentAddresses.length > 0) return uniquePaymentAddresses;

  return account?.taproot?.address ? [account.taproot.address] : [];
}

function isWalletTaprootAddress(account: WalletBalanceAccount, address: string): boolean {
  return address === account?.taproot?.address;
}

// ---------------------------------------------------------------------------
// Protobuf-based alkane balance fetching (ported from fuboku-app)
// Works directly with metashrew_view RPC — no REST layer needed.
// ---------------------------------------------------------------------------

function buildProtorunesPayload(address: string): string {
  const addrBuf = new TextEncoder().encode(address);
  const parts = [0x0a, addrBuf.length, ...addrBuf, 0x12, 0x02, 0x08, 0x01];
  return '0x' + Array.from(parts, b => b.toString(16).padStart(2, '0')).join('');
}

function pbVarint(data: Uint8Array, pos: number): [number, number] {
  // Multiplication-based assembly avoids JS's 32-bit signed bitwise ops.
  // `<<` and `|=` coerce to Int32, so any varint with bit 31 set (values
  // > 2^31, e.g. a DIESEL amount of 2.5B) flipped negative and surfaced as
  // "-25.-1" in the balances UI.
  let val = 0;
  let mult = 1;
  while (pos < data.length) {
    const b = data[pos++];
    val += (b & 0x7f) * mult;
    if (!(b & 0x80)) break;
    mult *= 128;
  }
  return [val, pos];
}

function pbVarintBig(data: Uint8Array, pos: number): [bigint, number] {
  let val = 0n;
  let shift = 0n;
  while (pos < data.length) {
    const b = data[pos++];
    val |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return [val, pos];
}

function pbField(data: Uint8Array, pos: number): [number, number, Uint8Array | number, number] | null {
  if (pos >= data.length) return null;
  const [tag, p1] = pbVarint(data, pos);
  const fieldNum = tag >> 3, wireType = tag & 7;
  if (wireType === 0) {
    const [val, p2] = pbVarint(data, p1);
    return [fieldNum, wireType, val, p2];
  } else if (wireType === 2) {
    const [len, p2] = pbVarint(data, p1);
    return [fieldNum, wireType, data.subarray(p2, p2 + len), p2 + len];
  }
  return [fieldNum, wireType, 0, p1 + 1];
}

/**
 * Parse protorunesbyaddress protobuf response.
 * Uses recursive scan to handle varying nesting depths across Docker/devnet.
 */
export function parseProtorunesResponse(hex: string): Map<string, bigint> {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!clean || clean === '') return new Map();
  const data = new Uint8Array(clean.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const balanceMap = new Map<string, bigint>();

  interface Found { block: number; tx: number; amount: bigint }

  function digForBlockTx(buf: Uint8Array, depth: number): { block: number; tx: number } {
    if (depth > 6) return { block: -1, tx: 0 };
    let pos = 0, block = -1, tx = 0;
    while (pos < buf.length) {
      const f = pbField(buf, pos);
      if (!f) break;
      const [fn, wt, val, np] = f;
      pos = np;
      // block/tx are small numbers (alkane IDs); filter out large varints (amounts)
      if (fn === 1 && wt === 0 && (val as number) <= 1000) block = val as number;
      if (fn === 2 && wt === 0) tx = val as number;
      if (wt === 2) {
        const inner = digForBlockTx(val as Uint8Array, depth + 1);
        if (inner.block >= 0) {
          if (fn === 2) {
            // field 2 = txindex — inner Uint128's "block" value is actually the tx
            tx = inner.block;
          } else {
            block = inner.block;
            tx = inner.tx;
          }
        }
      }
    }
    return { block, tx };
  }

  function parseBalanceEntry(buf: Uint8Array): Found | null {
    let pos = 0, block = -1, tx = 0, amount = 0n;
    while (pos < buf.length) {
      const f = pbField(buf, pos);
      if (!f) break;
      const [fn, wt, val, np] = f;
      pos = np;
      if (fn === 1 && wt === 2) {
        const id = digForBlockTx(val as Uint8Array, 0);
        if (id.block >= 0) { block = id.block; tx = id.tx; }
      }
      if (fn === 2 && wt === 2) {
        const amtBuf = val as Uint8Array;
        if (amtBuf.length > 0 && amtBuf[0] === 0x08) {
          const [v] = pbVarintBig(amtBuf, 1);
          amount = v;
        } else {
          for (let i = 0; i < amtBuf.length; i++) amount |= BigInt(amtBuf[i]) << (BigInt(i) * 8n);
        }
      }
      if (fn === 2 && wt === 0) amount = BigInt(val as number);
    }
    return block >= 0 ? { block, tx, amount } : null;
  }

  function parseBalanceSheet(buf: Uint8Array): Found[] {
    const results: Found[] = [];
    let pos = 0;
    while (pos < buf.length) {
      const f = pbField(buf, pos);
      if (!f) break;
      const [fn, wt, val, np] = f;
      pos = np;
      if (fn === 1 && wt === 2) {
        const e = parseBalanceEntry(val as Uint8Array);
        if (e) results.push(e);
      }
    }
    return results;
  }

  // Top level: repeated outpoints → f1 = balance_sheet
  let pos = 0;
  while (pos < data.length) {
    const f = pbField(data, pos);
    if (!f) break;
    const [fn, wt, val, np] = f;
    pos = np;
    if (fn !== 1 || wt !== 2) continue;
    // Inside outpoint: f1 = balance_sheet
    const outpoint = val as Uint8Array;
    let opos = 0;
    while (opos < outpoint.length) {
      const of_ = pbField(outpoint, opos);
      if (!of_) break;
      const [ofn, owt, oval, onp] = of_;
      opos = onp;
      if (ofn === 1 && owt === 2) {
        for (const e of parseBalanceSheet(oval as Uint8Array)) {
          if (e.block > 0 || e.tx > 0) {
            const key = `${e.block}:${e.tx}`;
            balanceMap.set(key, (balanceMap.get(key) || 0n) + e.amount);
          }
        }
      }
    }
  }

  return balanceMap;
}

/**
 * Compute spendable alkane balances by enriching the address's CURRENT
 * unspent UTXO set with per-outpoint balance sheets:
 *
 *   1. esplora_address::utxo  → unspent UTXOs at the address (BTC-layer
 *      truth — already excludes outpoints the user has spent).
 *   2. Promise.all(alkanes_protorunesbyoutpoint) per UTXO → alkane balance
 *      sheet at each outpoint.
 *   3. Aggregate per (block, tx).
 *
 * Why NOT `protorunesbyaddress`: the indexer's address-keyed view records
 * "this address received an alkane at this outpoint" but does not retract
 * entries when the outpoint is spent at the BTC layer. As a result, summing
 * across that view shows phantom balances on previously-held outpoints
 * (verified 2026-05-03: bc1p0eyy… reported 1800 DIESEL via address-view but
 * actually held only 58 DIESEL at currently-unspent outpoints).
 *
 * Espo's `/get-alkanes-by-address` has the same staleness class plus an
 * additional indexer-lag gap on freshly-confirmed UTXOs.
 *
 * Performance: dust UTXOs (≤1000 sats) are the only candidates for alkane
 * balances — protorunes encode token amounts on dust outputs. Filtering
 * before the protorunesbyoutpoint fan-out avoids a query per non-alkane
 * BTC UTXO. Each call is ~50ms; 10 dust UTXOs settle in ~100-200ms total
 * thanks to Promise.all parallelism.
 */
/**
 * Wrapper that returns the same {Map<alkaneId, bigint>} shape as the
 * old `parseProtorunesResponse` parser — so call sites that previously
 * issued raw `protorunesbyaddress` RPC and parsed the protobuf can
 * one-line-swap to this. Internally it goes through the canonical
 * UTXO+outpoint fanout below.
 *
 * `protorunesbyaddress` is forbidden in production (phantom-balance
 * bug per fetchAlkaneBalancesViaProtobuf docs above). The
 * `protorunesbyaddress` regression vitest enforces this.
 */
export async function fetchUserAlkaneBalances(
  network: string,
  address: string,
): Promise<Map<string, bigint>> {
  const items = await fetchAlkaneBalancesViaProtobuf(network, address);
  const map = new Map<string, bigint>();
  for (const item of items) {
    const id = `${item.alkaneId.block}:${item.alkaneId.tx}`;
    map.set(id, BigInt(item.balance));
  }
  return map;
}

export async function fetchAlkaneBalancesViaProtobuf(
  network: string,
  address: string,
): Promise<{ alkaneId: { block: string; tx: string }; balance: string }[]> {
  // ──────────────────────────────────────────────────────────────────────
  // MAINNET DISPLAY PATH — single alkanode call (~280ms total)
  // ──────────────────────────────────────────────────────────────────────
  // Per the user's 2026-05-13 directive: when the app-level data source is
  // ESPO, wallet state should use ESPO's populated spendable-outpoint path
  // instead of pairing an esplora UTXO list with per-outpoint metashrew fanout.
  //
  // Phantom-balance bug check (Rule SoT-1 ban): subfrost's
  // `alkanes_protorunesbyaddress` is banned because it reports phantom
  // balances on previously-spent outpoints. Alkanode's
  // `/get-alkanes-by-address` is a DIFFERENT upstream with a different
  // implementation — verified 2026-05-11 against test address
  // `bc1p0eyyqrkzaadectpjkqlj7zfjg92a9m5cf2kswm6u5q9ahvvpltgqhvlglj`:
  // alkanode returned 11 active tokens with totals matching the
  // per-outpoint metashrew sum exactly. No phantom entries. Safe for
  // display.
  //
  // What this REPLACES on mainnet for the wallet balance card:
  //   1× esplora_address::utxo (~50-100ms)
  //   N× alkanes_protorunesbyoutpoint (24 calls, p99=978ms each, retries)
  //   = ~10s wall clock
  // becomes:
  //   1× alkanode /get-alkanes-by-address (~280ms)
  //
  // What this does NOT touch:
  //   - Non-mainnet networks — they keep the metashrew path because
  //     alkanode hosts a mainnet espo deployment only.
  //
  // No fallback to metashrew on alkanode failure: per flex 2026-05-11
  // ("never more than 1 way"). If alkanode is down, display shows the
  // previous cached data via React Query, the swap path still works.
  if (network === 'mainnet') {
    const fromAlkanode = await tryRestAlkanesByAddress(network, address);
    if (fromAlkanode !== null) {
      // null === network/transport error; an empty array is a valid
      // "wallet has no alkanes" answer and we should return it.
      return fromAlkanode;
    }
    // Alkanode unreachable. Returning [] would make the wallet look
    // empty — not what we want. Bubble up empty so React Query keeps
    // showing previously-cached data on retry.
    console.warn(`[alkaneBalances] alkanode display path failed for ${address}; React Query will retry`);
    throw new Error(`alkanode /get-alkanes-by-address unreachable for ${address}`);
  }

  // ──────────────────────────────────────────────────────────────────────
  // NON-MAINNET PATH — esplora UTXOs + per-outpoint metashrew fanout
  // ──────────────────────────────────────────────────────────────────────
  // Step 1: esplora_address::utxo (via SDK-mediated rpc.ts).
  let utxos: { txid: string; vout: number; value: number }[] = [];
  try {
    utxos = await getAddressUtxos(network, address, AbortSignal.timeout(15_000));
  } catch (err) {
    console.warn(`[alkaneBalances] getAddressUtxos failed for ${address}:`, err);
    return [];
  }

  // Step 2: Promise.all alkanes_protorunesbyoutpoint per UTXO.
  //
  // On mainnet/regtest, alkane tokens live on dust outputs (~546-600 sats).
  // Filtering to ≤1000 sats keeps the fan-out small for live networks.
  //
  // On devnet, the in-process DIESEL mint (opcode 77) creates 10000-sat
  // outputs — not dust. The dust filter silently drops these and the balance
  // always shows 0. Since devnet uses a synchronous in-process indexer with
  // no phantom-balance risk, fan out to ALL confirmed UTXOs instead.
  const isDevnet = network === 'devnet';
  const dustUtxos = isDevnet ? utxos : utxos.filter((u) => u.value <= 1000);
  if (dustUtxos.length === 0) return [];

  // Per-outpoint retry: a single transient timeout silently dropped tokens
  // before (gabe's mainnet bug — 58 DIESEL displayed as 31 because one of
  // 24 dust outpoints intermittently failed and the catch returned []).
  // We retry up to 2 times with backoff, then propagate the failure as an
  // exception so the React Query layer marks the whole balance as errored
  // rather than silently rendering an undercount.
  const fetchWithRetry = async (
    txid: string,
    vout: number,
  ): Promise<Array<{ block: number | string; tx: number | string; amount: number | string }>> => {
    const RETRY_DELAYS = [0, 500, 1500];
    let lastErr: unknown;
    for (const delay of RETRY_DELAYS) {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      try {
        const resp = await getProtorunesByOutpoint(network, txid, vout, AbortSignal.timeout(15_000));
        return resp?.balance_sheet?.cached?.balances ?? [];
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`getProtorunesByOutpoint(${txid}:${vout}) failed after retries: ${lastErr}`);
  };

  // Use allSettled instead of all so a single subfrost failure doesn't
  // poison the entire wallet display. A user with 100+ dust UTXOs against a
  // degraded subfrost indexer would previously see zero balances because
  // ONE timed-out outpoint rejected Promise.all before the alkanode fallback
  // could fire (the `if (aggregate.size === 0)` branch was unreachable when
  // any single fetch threw). With allSettled we still aggregate every
  // success and fall back to alkanode if subfrost was uniformly empty OR
  // uniformly failing — both signatures of an indexer-drift incident.
  const checks = dustUtxos.map((u) => fetchWithRetry(u.txid, u.vout));
  const settled = await Promise.allSettled(checks);

  let failures = 0;
  const results: Array<Array<{ block: number | string; tx: number | string; amount: number | string }>> = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      results.push(r.value);
    } else {
      failures += 1;
      results.push([]);
    }
  }
  if (failures > 0) {
    console.warn(`[alkaneBalances] ${failures}/${dustUtxos.length} outpoints failed for ${address}`);
  }

  // Step 3: aggregate per (block, tx).
  const aggregate = new Map<string, bigint>();
  for (const balances of results) {
    for (const b of balances) {
      const block = String(b.block);
      const tx = String(b.tx);
      // Skip explicit zero entries (the indexer occasionally returns
      // {amount:0} placeholders for outpoints that mention an alkane id
      // without actually carrying value).
      const amount = BigInt(String(b.amount ?? 0));
      if (amount === 0n) continue;
      const key = `${block}:${tx}`;
      aggregate.set(key, (aggregate.get(key) ?? 0n) + amount);
    }
  }

  // No alkanode fallback here. Mainnet exits early at the top of this
  // function (single-call alkanode display path); this metashrew path
  // only runs for non-mainnet networks where alkanode doesn't host an
  // espo deployment. Per flex 2026-05-11: never more than 1 way to do
  // something. The `tryRestAlkanesByAddress` helper below is still
  // exported because it IS the mainnet display upstream now — it's
  // not a fallback layer.

  return Array.from(aggregate, ([id, bal]) => {
    const [block, tx] = id.split(':');
    return { alkaneId: { block, tx }, balance: bal.toString() };
  });
}

// PRIMARY display-balance fetch on mainnet (since 2026-05-11). Returns
// the same shape as the metashrew per-outpoint aggregator above so callers
// don't care which upstream answered.
//
// Returns:
//   - `[]` if alkanode says the wallet has no alkanes (valid empty answer)
//   - `null` if the network/transport call itself failed (caller should
//     retry or surface an error)
//
// Routes through `/api/rpc/{network}/get-alkanes-by-address` so the proxy's
// REST sub-path handler resolves the upstream (alkanode for mainnet, per
// flex 2026-05-10 + REST_PRIMARY_BASE_URLS in the mega-proxy). Routing
// through the proxy puts the URL config in one server-side place and lets
// ops swap it via a single env var (`ESPO_MAINNET_PRIMARY_URL`) without
// rebuilding the client.
//
// Phantom-balance bug (Rule SoT-1): subfrost's `alkanes_protorunesbyaddress`
// is banned because it reports phantom balances on previously-spent
// outpoints. Alkanode's address-keyed view is a different upstream with
// a different implementation — verified 2026-05-11 against test address
// `bc1p0eyyqrkzaadectpjkqlj7zfjg92a9m5cf2kswm6u5q9ahvvpltgqhvlglj`:
// alkanode totals matched the per-outpoint metashrew sum exactly, no
// phantom entries. Safe for display.
async function tryRestAlkanesByAddress(
  network: string,
  address: string,
): Promise<{ alkaneId: { block: string; tx: string }; balance: string }[] | null> {
  try {
    const resp = await fetch(`/api/rpc/${network}/get-alkanes-by-address`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    return items
      .map((item) => {
        const block = String(item?.alkaneId?.block ?? '');
        const tx = String(item?.alkaneId?.tx ?? '');
        const balance = String(item?.balance ?? '0');
        if (!block || !tx) return null;
        return { alkaneId: { block, tx }, balance };
      })
      .filter((x): x is { alkaneId: { block: string; tx: string }; balance: string } => x !== null);
  } catch (err) {
    console.warn('[alkaneBalances] REST fallback threw:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pre-warmed wallet UTXO cache
// ---------------------------------------------------------------------------
//
// Why this exists: PSBT construction in useSwapMutation /
// useAddLiquidityMutation / useAlkaneSendMutation needs to know which
// dust UTXOs carry alkanes. The naive path runs
// `esplora_address::utxo + Promise.all(protorunesbyoutpoint per dust)`
// at click-time. For wallets with >100 UTXOs that's ~5 seconds of
// blocking I/O between the click and the wallet popup — a real UX
// complaint surfaced by users.
//
// Architecture: a single TanStack Query, mounted eagerly when the
// wallet connects, that owns the canonical view of the wallet's
// UTXO set + balance sheets. `staleTime: Infinity` and only the
// HeightPoller invalidates it on block-tip change. Mutation hooks
// read out of the cached snapshot — no on-demand fanout.
//
// `protorunesbyaddress` is forbidden here too — same phantom-balance
// bug. The fanout uses `alkanes_protorunesbyoutpoint` per dust UTXO,
// which the indexer returns from current state and never carries
// stale entries.

/**
 * One UTXO + its alkane balance sheet (if any). The same shape mutation
 * hooks need for protostone construction.
 */
export interface CachedUtxo {
  txid: string;
  vout: number;
  value: number;
  /** Owning address — useful for wallets with both segwit + taproot. */
  address: string;
  scriptPubKeyHex?: string;
  blockHeight?: number | null;
  confirmations?: number;
  coinbase?: boolean;
  runes?: unknown[];
  /** Per-alkane amounts on this outpoint. Empty for non-dust BTC UTXOs. */
  alkanes: Array<{ block: number; tx: number; amount: bigint }>;
}

/**
 * The pre-warmed wallet view used everywhere a swap/send/addLiq
 * mutation needs to know what's on-chain. Lookups are O(1).
 */
export interface WalletUtxoCache {
  /** All UTXOs across the wallet's addresses, in fetch order. */
  utxos: CachedUtxo[];
  /** Lookup by `txid:vout`. Same entries as `utxos`. */
  byOutpoint: Map<string, CachedUtxo>;
  /** Lookup by alkane id (`block:tx`) → outpoints carrying it. */
  byAlkane: Map<string, CachedUtxo[]>;
  /** Aggregated per-alkane balance (sub-units). */
  balances: Map<string, bigint>;
  /** Snapshot height. Lets consumers reason about freshness. */
  height: number;
}

interface WalletUtxoCacheDeps {
  network: string;
  isInitialized: boolean;
  account: any;
  isConnected: boolean;
}

const EMPTY_UTXO_CACHE: WalletUtxoCache = {
  utxos: [],
  byOutpoint: new Map(),
  byAlkane: new Map(),
  balances: new Map(),
  height: 0,
};

const ESPO_PRICE_SCALE = 10_000_000_000_000_000;

function parseEspoScaledUsd(value: unknown): number | undefined {
  const raw = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const scaled = Number(raw);
  if (!Number.isFinite(scaled) || scaled <= 0) return undefined;
  return scaled / ESPO_PRICE_SCALE;
}

async function fetchEspoUsdPricesFrom10mCandles(
  network: string,
  alkaneIds: string[],
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(alkaneIds)].filter((id) => id && id !== '32:0');
  const prices = new Map<string, number>();
  if (uniqueIds.length === 0) return prices;

  const requests = uniqueIds.map((id, index) => ({
    jsonrpc: '2.0',
    id: `wallet-usd-price-${index}`,
    method: 'ammdata.get_candles',
    params: {
      pool: `${id}-usd`,
      timeframe: '10m',
      side: 'base',
      limit: 1,
      page: 1,
    },
  }));

  try {
    const res = await fetch(`/api/rpc/${network}/espo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requests),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return prices;

    const json = await res.json();
    const envelopes: any[] = Array.isArray(json) ? json : [json];
    const byId = new Map(envelopes.map((item) => [String(item?.id), item]));

    for (let i = 0; i < requests.length; i++) {
      const envelope = byId.get(String(requests[i].id));
      const result = envelope?.result;
      const candle = Array.isArray(result?.candles) ? result.candles[0] : null;
      if (result?.ok !== true || !candle) continue;
      const price = parseEspoScaledUsd(candle.close);
      if (price !== undefined) prices.set(uniqueIds[i], price);
    }
  } catch (err) {
    console.warn('[alkaneBalances] ESPO USD candle batch failed:', err);
  }

  return prices;
}

function buildWalletUtxoCache(utxos: CachedUtxo[], height: number): WalletUtxoCache {
  const deduped = new Map<string, CachedUtxo>();
  for (const u of utxos) {
    deduped.set(`${u.txid}:${u.vout}`, u);
  }

  const byOutpoint = new Map<string, CachedUtxo>();
  const byAlkane = new Map<string, CachedUtxo[]>();
  const balances = new Map<string, bigint>();
  const all = Array.from(deduped.values());
  for (const u of all) {
    byOutpoint.set(`${u.txid}:${u.vout}`, u);
    for (const a of u.alkanes) {
      const id = `${a.block}:${a.tx}`;
      if (!byAlkane.has(id)) byAlkane.set(id, []);
      byAlkane.get(id)!.push(u);
      balances.set(id, (balances.get(id) ?? 0n) + a.amount);
    }
  }

  return { utxos: all, byOutpoint, byAlkane, balances, height };
}

function parseEspoOutpoint(raw: unknown): { txid: string; vout: number } | null {
  if (typeof raw === 'string') {
    const [txid, voutRaw] = raw.split(':');
    const vout = Number(voutRaw);
    return txid && Number.isFinite(vout) ? { txid, vout } : null;
  }

  const obj = raw as any;
  const txid = String(obj?.txid ?? obj?.tx_id ?? obj?.transaction_id ?? '');
  const vout = Number(obj?.vout ?? obj?.index ?? obj?.n);
  return txid && Number.isFinite(vout) ? { txid, vout } : null;
}

function parseEspoAlkanes(raw: any): Array<{ block: number; tx: number; amount: bigint }> {
  const entries: any[] = Array.isArray(raw?.alkanes) ? raw.alkanes : [];
  return entries
    .map((entry: any) => {
      const id = String(entry?.alkane ?? entry?.alkaneId ?? entry?.alkane_id ?? entry?.id ?? '');
      const [blockRaw, txRaw] = id.split(':');
      const block = Number(entry?.block ?? entry?.alkaneId?.block ?? blockRaw);
      const tx = Number(entry?.tx ?? entry?.alkaneId?.tx ?? txRaw);
      const amount = BigInt(String(entry?.amount ?? entry?.balance ?? 0));
      if (!Number.isFinite(block) || !Number.isFinite(tx) || amount === 0n) return null;
      return { block, tx, amount };
    })
    .filter((x): x is { block: number; tx: number; amount: bigint } => x !== null);
}

function normalizeEspoSpendableOutpoint(raw: any, address: string): CachedUtxo | null {
  const parsed = parseEspoOutpoint(raw?.outpoint ?? raw);
  if (!parsed) return null;

  const value = getUtxoValueSats(raw);
  if (!Number.isFinite(value)) return null;

  return {
    txid: parsed.txid,
    vout: parsed.vout,
    value,
    address,
    scriptPubKeyHex:
      typeof raw?.script_pubkey_hex === 'string'
        ? raw.script_pubkey_hex
        : typeof raw?.scriptPubKeyHex === 'string'
          ? raw.scriptPubKeyHex
          : typeof raw?.script_pubkey === 'string'
            ? raw.script_pubkey
            : typeof raw?.txout?.script_pubkey_hex === 'string'
              ? raw.txout.script_pubkey_hex
              : undefined,
    blockHeight: raw?.block_height ?? null,
    confirmations: Number(raw?.confirmations ?? 0),
    coinbase: Boolean(raw?.coinbase),
    runes: Array.isArray(raw?.runes) ? raw.runes : [],
    alkanes: parseEspoAlkanes(raw),
  };
}

function getUtxoValueSats(raw: any): number {
  const explicitSats = Number(
    raw?.satoshis ??
    raw?.sats ??
    raw?.value ??
    raw?.txout?.value ??
    raw?.prevout?.value ??
    0,
  );
  if (Number.isFinite(explicitSats) && explicitSats > 0) return explicitSats;

  const amount = raw?.amount;
  if (typeof amount === 'string' && amount.includes('.')) {
    const btc = Number(amount);
    return Number.isFinite(btc) ? Math.round(btc * 100_000_000) : 0;
  }

  const value = Number(amount ?? 0);
  return Number.isFinite(value) ? value : 0;
}

async function fetchWalletUtxoCacheViaEspo(network: string, addresses: string[]): Promise<WalletUtxoCache> {
  const requests = addresses.map((address, index) => ({
    jsonrpc: '2.0',
    id: `wallet-spendable-${index}`,
    method: 'essentials.get_address_spendable_outpoints',
    params: {
      address,
      omit_raw_tx: true,
    },
  }));

  const res = await fetch(`/api/rpc/${network}/espo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requests),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`essentials.get_address_spendable_outpoints batch ${res.status}`);

  const json = await res.json();
  const envelopes: any[] = Array.isArray(json) ? json : [json];
  const byId = new Map(envelopes.map((item) => [String(item?.id), item]));

  const utxos: CachedUtxo[] = [];
  let height = 0;
  for (const request of requests) {
    const envelope = byId.get(String(request.id));
    if (!envelope) throw new Error(`missing ESPO batch response for ${request.id}`);
    if (envelope.error) {
      throw new Error(
        `essentials.get_address_spendable_outpoints failed: ${envelope.error.message ?? envelope.error.code ?? 'rpc error'}`,
      );
    }

    const result = envelope.result;
    if (result?.ok === false) {
      throw new Error(
        `essentials.get_address_spendable_outpoints failed: ${result.error ?? 'rpc error'}`,
      );
    }

    const outpoints = Array.isArray(result?.outpoints)
      ? result.outpoints
      : Array.isArray(result?.spendable_outpoints)
        ? result.spendable_outpoints
        : Array.isArray(result?.spendableOutpoints)
          ? result.spendableOutpoints
          : Array.isArray(result?.data?.outpoints)
            ? result.data.outpoints
            : Array.isArray(result?.data?.spendable_outpoints)
              ? result.data.spendable_outpoints
              : Array.isArray(result)
                ? result
                : [];
    const address = request.params.address;
    height = Math.max(height, Number(result?.height ?? 0) || 0);
    for (const raw of outpoints) {
      const utxo = normalizeEspoSpendableOutpoint(raw, address);
      if (utxo) utxos.push(utxo);
    }
  }

  return buildWalletUtxoCache(utxos, height);
}

export function walletUtxoCacheQueryOptions(deps: WalletUtxoCacheDeps) {
  const addresses = getWalletBalanceAddresses(deps.account);
  const addressKey = addresses.sort().join(',');

  return queryOptions<WalletUtxoCache>({
    queryKey: queryKeys.account.walletUtxoCache(deps.network, addressKey),
    enabled:
      deps.isInitialized &&
      !!deps.account &&
      deps.isConnected &&
      addresses.length > 0,
    // Staleness is governed by HeightPoller invalidation — block-tip
    // change is the only event that can mutate UTXO truth.
    staleTime: Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
    placeholderData: EMPTY_UTXO_CACHE,
    queryFn: async () => {
      if (getAlkanesDataSource(deps.network) === 'espo') {
        return fetchWalletUtxoCacheViaEspo(deps.network, addresses);
      }

      // Step 1: pull UTXOs for both addresses in parallel.
      const utxoArrays = await Promise.all(
        addresses.map(async (addr) => {
          try {
            const list = await getAddressUtxos(deps.network, addr, AbortSignal.timeout(15_000));
            return list.map((u) => ({ ...u, address: addr }));
          } catch (err) {
            console.warn(`[walletUtxoCache] getAddressUtxos failed for ${addr}:`, err);
            // Throw to trigger React Query's retry — preserves prior cache
            // rather than overwriting with [].
            throw err;
          }
        }),
      );
      const allUtxos = utxoArrays.flat();

      // Step 2: fan out alkanes_protorunesbyoutpoint for dust UTXOs.
      // Non-dust UTXOs are pure BTC and have no protorunes balance to
      // fetch (querying anyway just doubles the indexer load).
      const dustUtxos = allUtxos.filter((u) => u.value <= 1000);
      const alkaneMap = new Map<string, Array<{ block: number; tx: number; amount: bigint }>>();
      if (dustUtxos.length > 0) {
        const RETRY_DELAYS = [0, 500, 1500];
        const fetchWithRetry = async (txid: string, vout: number) => {
          let lastErr: unknown;
          for (const delay of RETRY_DELAYS) {
            if (delay > 0) await new Promise((r) => setTimeout(r, delay));
            try {
              const resp = await getProtorunesByOutpoint(
                deps.network,
                txid,
                vout,
                AbortSignal.timeout(15_000),
              );
              return resp?.balance_sheet?.cached?.balances ?? [];
            } catch (e) {
              lastErr = e;
            }
          }
          throw new Error(`getProtorunesByOutpoint(${txid}:${vout}) failed: ${lastErr}`);
        };
        // allSettled: a single failed dust outpoint must NOT poison the
        // entire fanout. Subfrost.io's /v4/subfrost was returning Cloudflare
        // 524s under burst load (verified 2026-05-11 dev log) — with
        // Promise.all the first 524 rejected the whole cache build, the
        // hook returned [], and alkanesExecuteTyped's prefetched_utxos
        // skip-fanout shortcut never kicked in, kicking the SDK back to
        // its own per-UTXO RPC fanout which then ALSO 524'd, hanging
        // the swap-confirm modal for ~2 minutes. Treat any failed dust
        // outpoint as "no asserted balance" (`alkanes: []`) — the SDK
        // will fall back to RPC for that single outpoint at submit time
        // if it's actually selected.
        const sheetsSettled = await Promise.allSettled(
          dustUtxos.map((u) => fetchWithRetry(u.txid, u.vout)),
        );
        let failedFanouts = 0;
        for (let i = 0; i < dustUtxos.length; i++) {
          const u = dustUtxos[i];
          const settled = sheetsSettled[i];
          if (!settled || settled.status === 'rejected') {
            failedFanouts++;
            continue;
          }
          const balances = settled.value ?? [];
          const alkanes: Array<{ block: number; tx: number; amount: bigint }> = [];
          for (const b of balances) {
            const amount = BigInt(String(b.amount ?? 0));
            if (amount === 0n) continue;
            alkanes.push({
              block: Number(b.block),
              tx: Number(b.tx),
              amount,
            });
          }
          if (alkanes.length > 0) {
            alkaneMap.set(`${u.txid}:${u.vout}`, alkanes);
          }
        }
        if (failedFanouts > 0) {
          console.warn(
            `[walletUtxoCache] ${failedFanouts}/${dustUtxos.length} dust outpoint fanouts failed; cache built from successful ones`,
          );
        }
      }

      // Step 2b: alkanode fallback for the wallet UTXO cache.
      //
      // Same indexer-drift signature PR #112 patches in the balance-display
      // path: dust UTXOs exist but the per-outpoint fanout came back empty
      // for ALL of them. Without this, the swap path reads the empty cache
      // and reports "Insufficient alkanes: have 0" even though the user's
      // balance display correctly shows the alkane (because the display
      // path has its own alkanode fallback).
      //
      // Alkanode returns address-aggregated balances, but the swap path's
      // SDK consumer (`select_utxos`) only checks "is there a UTXO whose
      // recorded alkane balance covers the request" — it doesn't care which
      // dust outpoint carries the balance. So we credit the ENTIRE balance
      // for each token to the FIRST dust UTXO at each address. The SDK
      // picks that UTXO, and on broadcast the real on-chain state is
      // resolved by the indexer (which by then will have caught up; the
      // cache is just a hint for selection, not a source of truth).
      //
      // Skipped on non-mainnet networks. SoT-1 still holds: alkanode is
      // consulted only when subfrost has zero data.
      if (alkaneMap.size === 0 && dustUtxos.length > 0 && deps.network === 'mainnet') {
        const fallbackByAddress = await Promise.all(
          addresses.map((addr) => tryRestAlkanesByAddress(deps.network, addr).then((res) => ({ addr, res }))),
        );
        const totalFallbackEntries = fallbackByAddress.reduce(
          (sum, { res }) => sum + (res?.length ?? 0),
          0,
        );
        if (totalFallbackEntries > 0) {
          console.warn(
            `[walletUtxoCache] subfrost returned 0 alkanes for ${dustUtxos.length} dust UTXOs; using REST fallback (${totalFallbackEntries} entries across ${fallbackByAddress.length} addresses)`,
          );
          // Credit each address's fallback balances to the first dust UTXO
          // belonging to that address. The SDK's selector treats the cache
          // as a hint about where balances live; the on-chain truth is
          // resolved at submit time, so any dust UTXO is a valid hint.
          for (const { addr, res } of fallbackByAddress) {
            if (!res || res.length === 0) continue;
            const carrier = dustUtxos.find((u) => u.address === addr);
            if (!carrier) continue;
            const alkanes: Array<{ block: number; tx: number; amount: bigint }> = res.map((entry) => ({
              block: Number(entry.alkaneId.block),
              tx: Number(entry.alkaneId.tx),
              amount: BigInt(entry.balance),
            }));
            alkaneMap.set(`${carrier.txid}:${carrier.vout}`, alkanes);
          }
        }
      }

      const utxos: CachedUtxo[] = allUtxos.map((u) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        address: u.address,
        alkanes: alkaneMap.get(`${u.txid}:${u.vout}`) ?? [],
      }));
      return buildWalletUtxoCache(utxos, 0);
    },
  });
}

// ---------------------------------------------------------------------------
// Sync status — metashrew vs bitcoind tip
// ---------------------------------------------------------------------------
//
// Alkane operations require the indexer to be caught up to bitcoind.
// If metashrew is behind, simulated swap quotes use stale reserves and
// the SDK's pre-broadcast sync check (which compares metashrew_height to
// getblockcount) errors with "Indexer sync timed out".
//
// Mutation hooks should refuse to submit alkane txs while !inSync, so
// the user sees a clear "indexer catching up" state instead of a
// generic mid-flight failure.

export interface SyncStatus {
  metashrewHeight: number;
  bitcoindHeight: number;
  /** True when metashrew >= bitcoind. */
  inSync: boolean;
  /** Number of blocks metashrew is behind. 0 = caught up or ahead. */
  lag: number;
}

const EMPTY_SYNC: SyncStatus = {
  metashrewHeight: 0,
  bitcoindHeight: 0,
  inSync: false,
  lag: 0,
};

export function syncStatusQueryOptions(network: string) {
  return queryOptions<SyncStatus>({
    queryKey: queryKeys.sync.status(network),
    // 4-second poll while a wallet flow is potentially active. Cheap
    // (two RPC calls) and guarantees the gate doesn't lag user clicks
    // by more than ~4s.
    refetchInterval: 4_000,
    staleTime: 3_500,
    placeholderData: EMPTY_SYNC,
    queryFn: async () => {
      const rpcUrl = getRpcUrl(network);
      const rpc = async (method: string, params: unknown[] = []): Promise<unknown> => {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) throw new Error(`${method} ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(`${method}: ${json.error.message ?? 'rpc error'}`);
        return json.result;
      };
      const [metashrewRaw, bitcoindRaw] = await Promise.all([
        rpc('metashrew_height').catch(() => 0),
        rpc('btc_getblockcount').catch(() => 0),
      ]);
      const metashrewHeight =
        typeof metashrewRaw === 'string' ? parseInt(metashrewRaw, 10) : Number(metashrewRaw ?? 0);
      const bitcoindHeight =
        typeof bitcoindRaw === 'string' ? parseInt(bitcoindRaw, 10) : Number(bitcoindRaw ?? 0);
      const lag = Math.max(0, bitcoindHeight - metashrewHeight);
      return {
        metashrewHeight,
        bitcoindHeight,
        inSync: metashrewHeight > 0 && metashrewHeight >= bitcoindHeight,
        lag,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Enriched wallet data
// ---------------------------------------------------------------------------

// Re-export types from useEnrichedWalletData for backward compat
export type { AlkaneAsset, EnrichedUTXO, WalletBalances } from '@/hooks/useEnrichedWalletData';

// Helper to recursively convert Map to plain object
function mapToObject(value: any): any {
  if (value instanceof Map) {
    const obj: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      obj[String(k)] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}


// ---------------------------------------------------------------------------
// Fast BTC balance - shared indexer-backed UTXO path for every wallet.
// ---------------------------------------------------------------------------

interface BtcBalanceFastDeps {
  account: any;
  isConnected: boolean;
  network: string;
  walletType: string | null;
}

export interface BtcBalanceFast {
  p2wpkh: number;
  p2tr: number;
  total: number;
  // Real spendable BTC for swap/send fees. For dual-address browser wallets
  // (Xverse/Leather/OYL) the SDK runs with `protect_taproot=true` and won't
  // spend taproot UTXOs for BTC fees — so `spendable` excludes p2tr there.
  // Keystore is taproot-only (spendable = p2tr). Single-address wallets have
  // exactly one address populated, so the sum is just that address.
  spendable: number;
  pendingIn: number;
  pendingOut: number;
}

function isConfirmedUtxo(raw: any): boolean {
  if (typeof raw?.status?.confirmed === 'boolean') return raw.status.confirmed;
  if (Number(raw?.confirmations ?? 0) > 0) return true;
  return Number(raw?.status?.block_height ?? raw?.block_height ?? raw?.height ?? 0) > 0;
}

async function fetchAddressBalance(rpcPath: string, address: string) {
  // Use esplora_address::utxo (proven working in codebase) and sum values
  const response = await fetch(rpcPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'esplora_address::utxo',
      params: [address],
      id: 1,
    }),
  });
  // Throw on HTTP errors — React Query will retry and preserve the last
  // known balance rather than overwriting it with zeros.
  if (!response.ok) throw new Error(`esplora_address::utxo HTTP ${response.status} for ${address}`);
  const json = await response.json();
  if (json.error) throw new Error(`esplora_address::utxo: ${json.error?.message ?? JSON.stringify(json.error)}`);
  const utxos = json.result;
  if (!Array.isArray(utxos)) throw new Error(`esplora_address::utxo: unexpected result shape for ${address}`);

  let confirmed = 0;
  let mempool = 0;
  for (const utxo of utxos) {
    const value = getUtxoValueSats(utxo);
    if (isConfirmedUtxo(utxo)) confirmed += value;
    else mempool += value;
  }

  return { confirmed, mempool, total: confirmed + mempool };
}

const BTC_BALANCE_CACHE_KEY = 'subfrost_btc_balance_cache';

/** Read last known BTC balance from localStorage — shown instantly while query loads. */
function getCachedBtcBalance(network: string, addressKey: string): BtcBalanceFast | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(BTC_BALANCE_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    if (cached?.network !== network || cached?.addressKey !== addressKey) return undefined;
    const balance = cached.balance as Partial<BtcBalanceFast> | undefined;
    if (!balance) return undefined;
    if (typeof balance.pendingIn !== 'number') balance.pendingIn = 0;
    if (typeof balance.pendingOut !== 'number') balance.pendingOut = 0;
    // Backfill `spendable` for entries written before the field existed —
    // `addressKey` is segwit,taproot sorted; "dual" means two distinct addrs.
    if (typeof balance.spendable !== 'number') {
      const isDualAddress = addressKey.includes(',');
      balance.spendable = isDualAddress ? (balance.p2wpkh ?? 0) : (balance.total ?? 0);
    }
    return balance as BtcBalanceFast;
  } catch { /* corrupt cache, ignore */ }
  return undefined;
}

/** Persist BTC balance to localStorage for instant display on next load. */
function cacheBtcBalance(network: string, addressKey: string, balance: BtcBalanceFast) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BTC_BALANCE_CACHE_KEY, JSON.stringify({
      network,
      addressKey,
      balance,
      ts: Date.now(),
    }));
  } catch { /* quota exceeded, ignore */ }
}

export function btcBalanceFastQueryOptions(deps: BtcBalanceFastDeps) {
  const addresses = getWalletBtcBalanceAddresses(deps.account);
  const addressKey = addresses.sort().join(',');

  const isLocal = ['devnet', 'regtest-local', 'qubitcoin-regtest'].includes(deps.network);

  // Use localStorage cache as initialData (not placeholderData) so it persists
  // through query errors. placeholderData is cleared when a query errors, causing
  // the balance to flicker to 0 if the RPC call fails on first load. initialData
  // is treated as real cached data — React Query preserves it on error.
  const cached = getCachedBtcBalance(deps.network, addressKey);

  return queryOptions<BtcBalanceFast>({
    queryKey: queryKeys.account.btcBalanceFast(deps.network, addressKey, deps.walletType),
    enabled:
      !!deps.account &&
      deps.isConnected &&
      addresses.length > 0,
    staleTime: isLocal ? 2_000 : Infinity,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    // initialData: treated as real data — survives query errors.
    // initialDataUpdatedAt: 0 ensures React Query considers it stale and
    // always fires a background refetch (refetchOnMount: 'always' also covers this).
    initialData: cached ?? undefined,
    initialDataUpdatedAt: cached ? 0 : undefined,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
    queryFn: async () => {
      // All wallets use the same indexer-backed UTXO path.
      const rpcPath = deps.network === 'devnet'
        ? 'http://localhost:18888'
        : `/api/rpc/${deps.network || 'mainnet'}`;

      const results = await Promise.all(addresses.map(addr => fetchAddressBalance(rpcPath, addr)));

      let p2wpkh = 0, p2tr = 0, confirmedP2wpkh = 0, confirmedP2tr = 0, pendingIn = 0;
      for (let i = 0; i < addresses.length; i++) {
        const result = results[i];
        pendingIn += result.mempool;
        if (isWalletTaprootAddress(deps.account, addresses[i])) {
          p2tr += result.total;
          confirmedP2tr += result.confirmed;
        } else {
          p2wpkh += result.total;
          confirmedP2wpkh += result.confirmed;
        }
      }

      // Mirrors `txContext.shouldProtectTaproot` from WalletContext + the
      // existing Header.tsx display logic: wallets with a payer/payment
      // address use that BTC address; taproot is counted only when it is the
      // actual BTC/payment address exposed by the wallet.
      const taprootAddr = deps.account?.taproot?.address;
      const hasPaymentAddress = addresses.some((address) => address !== taprootAddr);
      const spendable = hasPaymentAddress ? confirmedP2wpkh : confirmedP2wpkh + confirmedP2tr;

      const balance: BtcBalanceFast = { p2wpkh, p2tr, total: p2wpkh + p2tr, spendable, pendingIn, pendingOut: 0 };
      cacheBtcBalance(deps.network, addressKey, balance);
      return balance;
    },
  });
}

// ---------------------------------------------------------------------------
// Enriched wallet data (full UTXO details via lua — slower, background)
// ---------------------------------------------------------------------------

interface EnrichedWalletDeps {
  provider: WebProvider | null;
  isInitialized: boolean;
  account: any;
  isConnected: boolean;
  network: string;
}

export function enrichedWalletQueryOptions(deps: EnrichedWalletDeps) {
  const addresses = getWalletBtcBalanceAddresses(deps.account);
  const addressKey = addresses.sort().join(',');

  // Debug: log wallet state for balance queries

  // Enriched lua (balances.lua) disabled on all networks.
  // btcFast + alkaneBalances cover all display needs.
  // Lua provided spendable/assets UTXO categorization — no longer shown.
  return queryOptions({
    queryKey: queryKeys.account.enrichedWallet(deps.network, addressKey),
    enabled:
      false &&
      deps.isInitialized &&
      !!deps.provider &&
      !!deps.account &&
      deps.isConnected &&
      addresses.length > 0,
    // On local networks, short staleTime + polling for fast balance updates after operations.
    staleTime: (deps.network === 'devnet' || deps.network === 'regtest-local' || deps.network === 'qubitcoin-regtest') ? 2_000 : 30_000,
    refetchInterval: (deps.network === 'devnet' || deps.network === 'regtest-local' || deps.network === 'qubitcoin-regtest') ? 5_000 : undefined,
    // Refetch on mount only if stale (respects staleTime — prevents 6+ RPC calls on tab switch)
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    // Retry up to 3 times with exponential backoff — covers transient API failures
    // that previously caused empty balance display
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    queryFn: async () => {
      const provider = deps.provider!;

      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((resolve) =>
            setTimeout(() => {
              resolve(fallback);
            }, timeoutMs),
          ),
        ]);

      const fetchUtxosViaEsplora = async (address: string) => {
        try {
          const utxos = await getAddressUtxos(deps.network || 'mainnet', address);
          return utxos.map((utxo) => ({
            outpoint: `${utxo.txid}:${utxo.vout}`,
            value: utxo.value,
            height: utxo.status?.block_height || 0,
          }));
        } catch (err) {
          console.error(`[BALANCE] esplora fallback failed for ${address}:`, err);
          return null;
        }
      };

      const fetchMempoolSpent = async (address: string): Promise<number> => {
        try {
          const txs = await getAddressMempoolTxs(deps.network || 'mainnet', address);

          // Build set of mempool txids to distinguish confirmed vs unconfirmed parents
          const mempoolTxids = new Set(txs.map((tx) => tx.txid));

          let spent = 0;
          for (const tx of txs) {
            for (const vin of ((tx as any).vin || [])) {
              if (vin.prevout?.scriptpubkey_address === address) {
                // Only count if parent tx is NOT a mempool tx (i.e., parent is confirmed)
                if (!mempoolTxids.has(vin.txid)) {
                  spent += vin.prevout.value;
                }
              }
            }
          }
          return spent;
        } catch (err) {
          console.error(`[BALANCE] mempool spent fetch failed for ${address}:`, err);
          return 0;
        }
      };

      // Fire all three independent data sources in PARALLEL
      // (enriched balances, mempool spent, alkane balances)
      const enrichedDataPromises = addresses.map(async (address) => {
        try {
          // qubitcoin-regtest: skip getEnrichedBalances (not supported), go straight to esplora
          if (deps.network === 'qubitcoin-regtest') throw new Error('Skip to esplora for qubitcoin-regtest');

          // Lua balances script takes ~19s for wallets with many UTXOs (160+).
          // Timeout must be longer than the script runtime — otherwise fallback triggers
          // sequential getrawtransaction per UTXO which takes 48+ seconds.
          const rawResult = await withTimeout(provider.getEnrichedBalances(address), 25_000, null);
          if (!rawResult) throw new Error('getEnrichedBalances returned null/timeout');

          let enrichedData: any;
          if (rawResult instanceof Map) {
            const returns = rawResult.get('returns');
            enrichedData = mapToObject(returns);
          } else {
            enrichedData = rawResult?.returns || rawResult;
          }

          if (!enrichedData) {
            return {
              address,
              data: { spendable: [], assets: [], pending: [], ordHeight: 0, metashrewHeight: 0 },
            };
          }
          return { address, data: enrichedData };
        } catch (error) {
          console.warn(`[BALANCE] getEnrichedBalances failed for ${address}, trying esplora fallback:`, error);
          try {
            const spendable = await fetchUtxosViaEsplora(address);
            if (spendable && spendable.length > 0) {
              return {
                address,
                data: { spendable, assets: [], pending: [], ordHeight: 0, metashrewHeight: 0 },
              };
            }
          } catch {}
          return { address, data: null };
        }
      });

      const mempoolSpentPromises = addresses.map(async (address) => ({
        address,
        spent: await withTimeout(fetchMempoolSpent(address), 10000, 0),
      }));

      // Await BTC data sources in parallel — alkanes are fetched by a separate query
      const [enrichedResults, mempoolSpentResults] = await Promise.all([
        Promise.all(enrichedDataPromises),
        Promise.all(mempoolSpentPromises),
      ]);

      const toArray = (val: any): any[] => {
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object' && Object.keys(val).length > 0) return Object.values(val);
        return [];
      };

      const pendingTxids = new Set<string>();
      for (const { data } of enrichedResults) {
        if (!data) continue;
        for (const utxo of toArray(data.pending)) {
          const [txid] = (utxo?.outpoint || ':').split(':');
          if (txid) pendingTxids.add(txid);
        }
      }
      const confirmedPendingTxids = new Set<string>();
      await Promise.all(
        [...pendingTxids].map(async (txid) => {
          const tx = await getEsploraTx(deps.network || 'mainnet', txid);
          if (tx?.status?.confirmed) confirmedPendingTxids.add(txid);
        }),
      );

      let totalBtc = 0;
      let p2wpkhBtc = 0;
      let p2trBtc = 0;
      let spendableBtc = 0;
      let withAssetsBtc = 0;
      let pendingP2wpkhBtc = 0;
      let pendingP2trBtc = 0;
      let pendingTotalBtc = 0;
      const allUtxos: any[] = [];
      const p2wpkhUtxos: any[] = [];
      const p2trUtxos: any[] = [];
      const runeMap = new Map<string, any>();
      const pendingTxIdsP2wpkh = new Set<string>();
      const pendingTxIdsP2tr = new Set<string>();

      for (const { address, data } of enrichedResults) {
        if (!data) continue;
        const isP2TR = isWalletTaprootAddress(deps.account, address);
        const isP2WPKH = !isP2TR;

        const processUtxo = (utxo: any, isConfirmed: boolean, isSpendable: boolean) => {
          const [txid, voutStr] = (utxo.outpoint || ':').split(':');
          const vout = parseInt(voutStr || '0', 10);
          const enrichedUtxo = {
            txid,
            vout,
            value: utxo.value,
            address,
            status: { confirmed: isConfirmed, block_height: utxo.height },
            inscriptions: utxo.inscriptions,
            runes: utxo.ord_runes,
          };
          allUtxos.push(enrichedUtxo);
          if (isP2WPKH) p2wpkhUtxos.push(enrichedUtxo);
          else if (isP2TR) p2trUtxos.push(enrichedUtxo);

          if (isConfirmed) {
            // Confirmed: add to headline balances
            if (isP2WPKH) p2wpkhBtc += utxo.value;
            else if (isP2TR) p2trBtc += utxo.value;
            totalBtc += utxo.value;
            if (isSpendable) spendableBtc += utxo.value;
            else withAssetsBtc += utxo.value;
          } else {
            // Pending: track separately
            if (isP2WPKH) pendingP2wpkhBtc += utxo.value;
            else if (isP2TR) pendingP2trBtc += utxo.value;
            pendingTotalBtc += utxo.value;
            if (txid) {
              if (isP2WPKH) pendingTxIdsP2wpkh.add(txid);
              else if (isP2TR) pendingTxIdsP2tr.add(txid);
            }
          }

          if (utxo.ord_runes) {
            for (const [runeId, runeData] of Object.entries(utxo.ord_runes)) {
              const rd = runeData as any;
              if (!runeMap.has(runeId)) {
                runeMap.set(runeId, { id: runeId, symbol: rd.symbol, balance: rd.amount, divisibility: rd.divisibility });
              } else {
                const existing = runeMap.get(runeId)!;
                existing.balance = (BigInt(existing.balance) + BigInt(rd.amount)).toString();
              }
            }
          }
        };

        for (const utxo of toArray(data.spendable)) processUtxo(utxo, true, true);
        for (const utxo of toArray(data.assets)) processUtxo(utxo, true, false);
        for (const utxo of toArray(data.pending)) {
          const [txid] = (utxo?.outpoint || ':').split(':');
          processUtxo(utxo, confirmedPendingTxids.has(txid), false);
        }
      }

      // Process mempool spent results (already fetched in parallel above)
      let pendingOutgoingP2wpkh = 0;
      let pendingOutgoingP2tr = 0;
      let pendingOutgoingTotal = 0;
      for (const { address, spent } of mempoolSpentResults) {
        if (isWalletTaprootAddress(deps.account, address)) pendingOutgoingP2tr += spent;
        else pendingOutgoingP2wpkh += spent;
        pendingOutgoingTotal += spent;
      }

      return {
        balances: {
          bitcoin: {
            p2wpkh: p2wpkhBtc,
            p2tr: p2trBtc,
            total: totalBtc,
            spendable: spendableBtc,
            withAssets: withAssetsBtc,
            pendingP2wpkh: pendingP2wpkhBtc,
            pendingP2tr: pendingP2trBtc,
            pendingTotal: pendingTotalBtc,
            pendingOutgoingP2wpkh,
            pendingOutgoingP2tr,
            pendingOutgoingTotal,
          },
          pendingTxCount: { p2wpkh: pendingTxIdsP2wpkh.size, p2tr: pendingTxIdsP2tr.size },
          alkanes: [] as any[],
          runes: Array.from(runeMap.values()),
        },
        utxos: { p2wpkh: p2wpkhUtxos, p2tr: p2trUtxos, all: allUtxos },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Alkane balances (separate query — decoupled from BTC/UTXO fetch)
// ---------------------------------------------------------------------------

interface AlkaneBalanceDeps {
  provider: WebProvider | null;
  isInitialized: boolean;
  account: any;
  isConnected: boolean;
  network: string;
}

export function alkaneBalanceQueryOptions(deps: AlkaneBalanceDeps) {
  const addresses = getWalletBalanceAddresses(deps.account);
  const addressKey = addresses.sort().join(',');

  return queryOptions({
    queryKey: queryKeys.account.alkaneBalances(deps.network, addressKey),
    enabled:
      deps.isInitialized &&
      !!deps.provider &&
      !!deps.account &&
      deps.isConnected &&
      addresses.length > 0,
    // ⚠️ CRITICAL (2026-03-26): On devnet, staleTime MUST be short and polling
    // MUST be enabled. Without this, balances never update after faucet/wrap
    // operations. The issue: DevnetControlPanel calls refetchQueries() after
    // faucets, but React Query skips refetch if data is within staleTime.
    // With 30s staleTime, clicking +DIESEL shows "Done" but balance stays at 0
    // for up to 30 seconds. 2s staleTime + 5s polling ensures balances refresh
    // within seconds. DO NOT increase devnet staleTime or remove polling.
    // See faucet-e2e.test.ts which proves the queryFn itself works correctly —
    // the issue was purely React Query caching, not the data fetching logic.
    // On mainnet: Infinity staleTime — only HeightPoller invalidation triggers refetch.
    // On local networks: short staleTime + polling for fast updates after faucet/wrap.
    staleTime: (deps.network === 'devnet' || deps.network === 'regtest-local' || deps.network === 'qubitcoin-regtest') ? 2_000 : Infinity,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchInterval: (deps.network === 'devnet' || deps.network === 'regtest-local' || deps.network === 'qubitcoin-regtest') ? 5_000 : undefined,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
    queryFn: async () => {
      const provider = deps.provider!;
      const alkaneMap = new Map<string, any>();

      // Fetch all addresses in parallel (was sequential for...of loop).
      //
      // Uses the canonical metashrew indexer's `protorunesbyaddress` view
      // for ALL networks. Espo's `/get-alkanes-by-address` was lagging /
      // missing fresh outpoints on mainnet (verified 2026-05-03 via tx
      // 2255b42e... — espo returned 0 items while protorunesbyaddress
      // showed the correct DIESEL+frBTC balances). The address-keyed view
      // is fast and consistent with what the contract sees at submit time;
      // espo is appropriate for token metadata / pool lists, not balances.
      const fetchForAddress = async (address: string): Promise<any[]> => {
        return fetchAlkaneBalancesViaProtobuf(deps.network || 'mainnet', address);
      };

      // Do NOT catch per-address failures here. The outpoint fanout in
      // fetchAlkaneBalancesViaProtobuf already retries 3× per outpoint
      // (cc22225); if it still throws, the indexer is genuinely struggling.
      // Letting the failure propagate triggers React Query's retry loop and,
      // crucially, preserves the previously-successful `data` rather than
      // overwriting it with `[]`. Returning `[]` here was vanishing every
      // alkane balance the moment one outpoint timed out on a refetch.
      const allResults = await Promise.all(addresses.map(fetchForAddress));

      for (const items of allResults) {
        for (const item of items) {
          const block = item.alkaneId?.block;
          const tx = item.alkaneId?.tx;
          if (block == null || tx == null) continue;

          const alkaneId = `${block}:${tx}`;
          const balance = String(item.balance || '0');
          const knownInfo = KNOWN_TOKENS[alkaneId];

          if (!alkaneMap.has(alkaneId)) {
            alkaneMap.set(alkaneId, {
              alkaneId,
              name: item.name || knownInfo?.name || `Token ${alkaneId}`,
              symbol: item.symbol || knownInfo?.symbol || '',
              balance,
              decimals: knownInfo?.decimals ?? 8,
              logo: item.tokenImage || undefined,
              // frBTC is bridged 1:1 with BTC, but espo derives priceUsd from
              // the bUSD/frBTC pool — that pool isn't peg-arbitraged so its
              // implied price drifts. Skip it for frBTC and let consumers fall
              // back to the live BTC price.
              priceUsd: alkaneId === '32:0'
                ? undefined
                : (item.priceUsd || item.busdPoolPriceInUsd || undefined),
              priceInSatoshi: item.priceInSatoshi ? Number(item.priceInSatoshi) : undefined,
            });
          } else {
            const existing = alkaneMap.get(alkaneId)!;
            try {
              existing.balance = (BigInt(existing.balance) + BigInt(balance)).toString();
            } catch {
              existing.balance = String(Number(existing.balance || 0) + Number(balance));
            }
          }
        }
      }

      // ── Token name / symbol enrichment ──────────────────────────────────
      // The outpoint-aggregation path (esplora_address::utxo +
      // alkanes_protorunesbyoutpoint) returns balances only — no metadata.
      // Without enrichment, anything outside KNOWN_TOKENS renders as
      // "Token 2:NN" in the wallet, which is what gabe reports on
      // staging-app.subfrost.io.
      //
      // Fix: one batched call to /api/token-details (which after PR-A is
      // routed to canon Espo on alkanode — verified 2026-05-10 to return
      // real name+symbol for any mainnet alkane). Names are immutable, so
      // the outer query's `staleTime: Infinity` (mainnet) caches the
      // enriched result forever — HeightPoller is the only invalidator.
      //
      // Display contract for AlkanesBalancesCard:
      //   title       = entry.name      (e.g. "METHANE", "FARTANE")
      //   description = entry.symbol + " · " + entry.alkaneId
      //                 (e.g. "CH4 · 2:16", "H2S · 2:69")
      // To honor that pattern, after enrichment we ensure BOTH name and
      // symbol are populated for every alkane, falling back gracefully if
      // alkanode returns only one.
      const unknownIds = [...alkaneMap.keys()].filter((id) => !KNOWN_TOKENS[id]);
      if (unknownIds.length > 0) {
        const meta = await getAlkaneInfoBatch(deps.network || 'mainnet', unknownIds);
        for (const [id, info] of Object.entries(meta)) {
          const entry = alkaneMap.get(id);
          if (!entry) continue;
          if (info.name && entry.name === `Token ${id}`) entry.name = info.name;
          if (info.symbol && !entry.symbol) entry.symbol = info.symbol;
          if (info.decimals != null) entry.decimals = info.decimals;
        }
      }

      if (getAlkanesDataSource(deps.network) === 'espo') {
        const priceIds = [...alkaneMap.entries()]
          .filter(([id, entry]) => id !== '32:0' && !(entry.priceUsd > 0))
          .map(([id]) => id);
        const espoUsdPrices = await fetchEspoUsdPricesFrom10mCandles(
          deps.network || 'mainnet',
          priceIds,
        );
        for (const [id, priceUsd] of espoUsdPrices) {
          const entry = alkaneMap.get(id);
          if (entry) entry.priceUsd = priceUsd;
        }
      }

      // Final pass: any alkane that's still missing a `name` or `symbol`
      // gets a sane derivation from whatever we DO have, so the wallet card
      // never displays a generic placeholder. Order of preference:
      //   - If `name` is still the "Token X:Y" placeholder but symbol is set,
      //     use symbol as the name (some unknowns have only a symbol on chain).
      //   - If `symbol` is still empty but name is real, mirror name into
      //     symbol so the description line `${symbol} · ${id}` reads sensibly.
      for (const [id, entry] of alkaneMap.entries()) {
        const placeholderName = `Token ${id}`;
        if (entry.name === placeholderName && entry.symbol) {
          entry.name = entry.symbol;
        }
        if (!entry.symbol && entry.name && entry.name !== placeholderName) {
          entry.symbol = entry.name;
        }
      }

      // Sort: frBTC first, DIESEL second, then by USD value desc, then by block:tx
      return Array.from(alkaneMap.values()).sort((a, b) => {
        if (a.alkaneId === '32:0') return -1;
        if (b.alkaneId === '32:0') return 1;
        if (a.alkaneId === '2:0') return -1;
        if (b.alkaneId === '2:0') return 1;
        const aUsd = (a.priceUsd || 0) * Number(a.balance) / 1e8;
        const bUsd = (b.priceUsd || 0) * Number(b.balance) / 1e8;
        if (aUsd !== bUsd) return bUsd - aUsd;
        const [aBlock, aTx] = a.alkaneId.split(':').map(Number);
        const [bBlock, bTx] = b.alkaneId.split(':').map(Number);
        return aBlock !== bBlock ? aBlock - bBlock : aTx - bTx;
      });
    },
  });
}

// ---------------------------------------------------------------------------
// BTC balance
// ---------------------------------------------------------------------------

export function btcBalanceQueryOptions(
  network: string,
  address: string | undefined,
  isConnected: boolean,
  getSpendableTotalBalance: () => Promise<number>,
) {
  return queryOptions<number>({
    queryKey: queryKeys.account.btcBalance(network, address || ''),
    enabled: Boolean(isConnected && address),
    queryFn: async () => {
      try {
        const satoshis = await getSpendableTotalBalance();
        return Number(satoshis || 0);
      } catch (err) {
        console.error('[useBtcBalance] Error:', err);
        return 0;
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Sellable currencies
// ---------------------------------------------------------------------------

const KNOWN_TOKENS_SELL: Record<string, { symbol: string; name: string; decimals: number }> = {
  '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
  '32:0': { symbol: 'frBTC', name: 'frBTC', decimals: 8 },
};

interface SellableCurrenciesDeps {
  provider: WebProvider | null;
  isInitialized: boolean;
  network: string;
  walletAddress?: string;
  account: any;
  tokensWithPools?: { id: string; name?: string }[];
}

export function sellableCurrenciesQueryOptions(deps: SellableCurrenciesDeps) {
  const tokensKey = deps.tokensWithPools
    ? deps.tokensWithPools.map((t) => t.id).sort().join(',')
    : '';

  const isLocal = ['devnet', 'regtest-local', 'qubitcoin-regtest'].includes(deps.network);
  return queryOptions<CurrencyPriceInfoResponse[]>({
    queryKey: queryKeys.account.sellableCurrencies(deps.network, deps.walletAddress || '', tokensKey),
    enabled: deps.isInitialized && !!deps.provider && !!deps.walletAddress,
    staleTime: isLocal ? 2_000 : 30_000,
    queryFn: async (): Promise<CurrencyPriceInfoResponse[]> => {
      if (!deps.walletAddress || !deps.provider) return [];

      try {
        const allAlkanes: CurrencyPriceInfoResponse[] = [];
        const alkaneMap = new Map<string, CurrencyPriceInfoResponse>();

        const addresses = getWalletBalanceAddresses(deps.account);
        if (deps.walletAddress && !addresses.includes(deps.walletAddress)) {
          addresses.push(deps.walletAddress);
        }

        const sellBalancePromises = addresses.map(async (address) => {
          try {
            // 2026-05-04: All networks now use the canonical UTXO-derived
            // outpoint fanout (`fetchAlkaneBalancesViaProtobuf`) for swap
            // form percentage buttons.
            //
            // Previously mainnet hit `/api/alkane-balances`, a Next.js
            // server-side proxy that uses the address-keyed
            // `alkanes_protorunesbyaddress` view. That view sums spent +
            // unspent outpoints (the indexer never retracts entries when
            // the UTXO is spent at the BTC layer), producing phantom
            // balances. Wallet UI was switched to the outpoint fanout in
            // 9ec751fb but `sellableCurrencies` (this query) was missed —
            // user could click "MAX" and see ~58 DIESEL spendable when
            // they actually only had 31. Same fix path now used by both.
            let balances: { alkaneId: string; balance: string; name?: string; symbol?: string }[] = [];

            const rawItems = await fetchAlkaneBalancesViaProtobuf(deps.network, address);
            for (const item of rawItems) {
              const id = `${item.alkaneId.block}:${item.alkaneId.tx}`;
              const known = KNOWN_TOKENS_SELL[id];
              balances.push({
                alkaneId: id,
                balance: item.balance,
                name: known?.name,
                symbol: known?.symbol,
              });
            }

            for (const entry of balances) {
              const alkaneIdStr = entry.alkaneId;
              const balance = String(entry.balance || '0');
              // Use metadata from the data API response, fall back to known tokens, then raw ID
              const knownToken = KNOWN_TOKENS_SELL[alkaneIdStr];
              const tokenInfo = {
                symbol: entry.symbol || knownToken?.symbol || entry.name || alkaneIdStr.split(':')[1] || '',
                name: entry.name || knownToken?.name || entry.symbol || alkaneIdStr,
                decimals: knownToken?.decimals ?? 8,
              };

              if (deps.tokensWithPools && !deps.tokensWithPools.some((p) => p.id === alkaneIdStr)) {
                continue;
              }

              if (!alkaneMap.has(alkaneIdStr)) {
                alkaneMap.set(alkaneIdStr, {
                  id: alkaneIdStr,
                  address: deps.walletAddress!,
                  name: tokenInfo.name,
                  symbol: tokenInfo.symbol,
                  balance,
                  priceInfo: {
                    price: 0,
                    idClubMarketplace: false,
                  },
                });
              } else {
                const existing = alkaneMap.get(alkaneIdStr)!;
                try {
                  existing.balance = (BigInt(existing.balance || '0') + BigInt(balance)).toString();
                } catch {
                  existing.balance = String(Number(existing.balance || 0) + Number(balance));
                }
              }
            }
          } catch (error) {
            console.error(`[sellableCurrencies] alkane-balances API failed for ${address}:`, error);
          }
        });
        await Promise.all(sellBalancePromises);

        allAlkanes.push(...alkaneMap.values());

        allAlkanes.sort((a, b) => {
          try {
            const balA = BigInt(a.balance || '0');
            const balB = BigInt(b.balance || '0');
            if (balA === balB) return (a.name || '').localeCompare(b.name || '');
            return balA > balB ? -1 : 1;
          } catch {
            const balA = Number(a.balance || 0);
            const balB = Number(b.balance || 0);
            if (balA === balB) return (a.name || '').localeCompare(b.name || '');
            return balA > balB ? -1 : 1;
          }
        });

        return allAlkanes;
      } catch (error) {
        console.error('[sellableCurrencies] Error:', error);
        return [];
      }
    },
  });
}
