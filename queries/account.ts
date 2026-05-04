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
  getProtorunesByOutpoint,
} from '@/lib/alkanes/rpc';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

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
async function fetchAlkaneBalancesViaProtobuf(
  network: string,
  address: string,
): Promise<{ alkaneId: { block: string; tx: string }; balance: string }[]> {
  // Step 1: esplora_address::utxo (via SDK-mediated rpc.ts).
  let utxos: { txid: string; vout: number; value: number }[] = [];
  try {
    utxos = await getAddressUtxos(network, address, AbortSignal.timeout(15_000));
  } catch (err) {
    console.warn(`[alkaneBalances] getAddressUtxos failed for ${address}:`, err);
    return [];
  }

  // Step 2: Promise.all alkanes_protorunesbyoutpoint per dust UTXO.
  //
  // Alkane tokens live on dust outputs (~546-600 sats). Filtering to ≤1000
  // sats keeps the fan-out small. The indexer answers each outpoint query
  // independently, so parallelism is safe and bounded by the number of
  // dust UTXOs at the address (typically <30 for active wallets).
  const dustUtxos = utxos.filter((u) => u.value <= 1000);
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

  const checks = dustUtxos.map((u) => fetchWithRetry(u.txid, u.vout));
  const results = await Promise.all(checks);

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

  return Array.from(aggregate, ([id, bal]) => {
    const [block, tx] = id.split(':');
    return { alkaneId: { block, tx }, balance: bal.toString() };
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
// Fast BTC balance — wallet API first, esplora fallback (no lua)
// Browser wallets (UniSat, OKX) return balance instantly from their own state.
// For SDK/keystore wallets, falls back to esplora address stats (~200ms).
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
  pendingIn: number;
  pendingOut: number;
}

async function fetchBalanceFromWalletApi(): Promise<BtcBalanceFast | null> {
  const connectedId = localStorage.getItem('subfrost_browser_wallet_id');

  // UniSat: getBitcoinUtxos() returns only clean/spendable UTXOs (no inscriptions/runes).
  if (connectedId === 'unisat') {
    const unisat = (window as any).unisat;
    if (unisat?.getBitcoinUtxos) {
      try {
        // Ensure session is active — auto-reconnect from cache doesn't activate it.
        const accounts = unisat.getAccounts ? await unisat.getAccounts() : [];
        if (!accounts?.length && unisat.requestAccounts) {
          await unisat.requestAccounts();
        }
        const utxos = await unisat.getBitcoinUtxos();
        if (Array.isArray(utxos) && utxos.length > 0) {
          const spendable = utxos.reduce((sum: number, u: any) => sum + (u.satoshis || 0), 0);
          return { p2wpkh: 0, p2tr: spendable, total: spendable, pendingIn: 0, pendingOut: 0 };
        }
      } catch { /* fall through to esplora */ }
    }
  }

  // OKX, Xverse, OYL — no wallet-side balance API. Falls through to esplora.

  return null;
}

async function fetchAddressBalance(rpcPath: string, address: string) {
  // Use esplora_address::utxo (proven working in codebase) and sum values
  const response = await fetch(rpcPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'esplora_address::utxo',
      params: [address],
      id: 1,
    }),
  });
  const json = await response.json();
  const utxos = json.result;
  if (!Array.isArray(utxos)) return 0;
  return utxos.reduce((sum: number, u: any) => sum + (u.value || 0), 0);
}

const BTC_BALANCE_CACHE_KEY = 'subfrost_btc_balance_cache';

/** Read last known BTC balance from localStorage — shown instantly while query loads. */
function getCachedBtcBalance(network: string, addressKey: string): BtcBalanceFast | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem(BTC_BALANCE_CACHE_KEY);
    if (!raw) return undefined;
    const cached = JSON.parse(raw);
    // Only use cache if it's for the same network + addresses
    if (cached?.network === network && cached?.addressKey === addressKey) {
      return cached.balance as BtcBalanceFast;
    }
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
  const addresses: string[] = [];
  if (deps.account?.nativeSegwit?.address) addresses.push(deps.account.nativeSegwit.address);
  if (deps.account?.taproot?.address) addresses.push(deps.account.taproot.address);
  const addressKey = addresses.sort().join(',');

  const isLocal = ['devnet', 'regtest-local', 'qubitcoin-regtest'].includes(deps.network);

  // Show cached balance instantly while the real query loads (eliminates LCP wait)
  const cached = getCachedBtcBalance(deps.network, addressKey);

  return queryOptions<BtcBalanceFast>({
    queryKey: queryKeys.account.btcBalanceFast(deps.network, addressKey, deps.walletType),
    enabled: !!deps.account && deps.isConnected && addresses.length > 0,
    staleTime: isLocal ? 2_000 : Infinity,
    refetchOnMount: true,
    placeholderData: cached,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 5000),
    queryFn: async () => {
      // Browser wallet: get balance directly from wallet API (instant)
      if (deps.walletType === 'browser' && typeof window !== 'undefined') {
        const walletBal = await fetchBalanceFromWalletApi();
        if (walletBal) {
          cacheBtcBalance(deps.network, addressKey, walletBal);
          return walletBal;
        }
      }

      // Fallback: esplora UTXOs
      const rpcPath = deps.network === 'devnet'
        ? 'http://localhost:18888'
        : `/api/rpc/${deps.network || 'mainnet'}`;

      const results = await Promise.all(addresses.map(addr => fetchAddressBalance(rpcPath, addr)));

      let p2wpkh = 0, p2tr = 0;
      for (let i = 0; i < addresses.length; i++) {
        if (addresses[i] === deps.account.nativeSegwit?.address) p2wpkh = results[i];
        if (addresses[i] === deps.account.taproot?.address) p2tr = results[i];
      }

      const balance: BtcBalanceFast = { p2wpkh, p2tr, total: p2wpkh + p2tr, pendingIn: 0, pendingOut: 0 };
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
  const addresses: string[] = [];
  if (deps.account?.nativeSegwit?.address) addresses.push(deps.account.nativeSegwit.address);
  if (deps.account?.taproot?.address) addresses.push(deps.account.taproot.address);
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
        const isP2WPKH = address === deps.account.nativeSegwit?.address;
        const isP2TR = address === deps.account.taproot?.address;

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

        const toArray = (val: any): any[] => {
          if (Array.isArray(val)) return val;
          if (val && typeof val === 'object' && Object.keys(val).length > 0) return Object.values(val);
          return [];
        };

        for (const utxo of toArray(data.spendable)) processUtxo(utxo, true, true);
        for (const utxo of toArray(data.assets)) processUtxo(utxo, true, false);
        for (const utxo of toArray(data.pending)) processUtxo(utxo, false, false);
      }

      // Process mempool spent results (already fetched in parallel above)
      let pendingOutgoingP2wpkh = 0;
      let pendingOutgoingP2tr = 0;
      let pendingOutgoingTotal = 0;
      for (const { address, spent } of mempoolSpentResults) {
        if (address === deps.account.nativeSegwit?.address) pendingOutgoingP2wpkh += spent;
        else if (address === deps.account.taproot?.address) pendingOutgoingP2tr += spent;
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
  const addresses: string[] = [];
  if (deps.account?.nativeSegwit?.address) addresses.push(deps.account.nativeSegwit.address);
  if (deps.account?.taproot?.address) addresses.push(deps.account.taproot.address);
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
      // Fix: one batched call to /api/token-details (via the SDK-mediated
      // rpc.ts layer) for all unknown ids. Names are immutable, so the
      // outer query's `staleTime: Infinity` (mainnet) caches the enriched
      // result forever — HeightPoller is the only invalidator.
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

        const addresses: string[] = [];
        if (deps.account?.nativeSegwit?.address) addresses.push(deps.account.nativeSegwit.address);
        if (deps.account?.taproot?.address) addresses.push(deps.account.taproot.address);
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
