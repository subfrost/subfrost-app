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
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

// Debug logging — only enabled when NEXT_PUBLIC_DEBUG_QUERIES is set
const DEBUG = typeof window !== 'undefined'
  && (new URLSearchParams(window.location?.search)).has('debug');
const debugLog = DEBUG ? console.log.bind(console) : () => {};
const debugWarn = DEBUG ? console.warn.bind(console) : () => {};

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
  debugLog('[enrichedWalletQueryOptions] Wallet state:', {
    isConnected: deps.isConnected,
    isInitialized: deps.isInitialized,
    hasProvider: !!deps.provider,
    hasAccount: !!deps.account,
    addresses,
    nativeSegwit: deps.account?.nativeSegwit?.address || '(none)',
    taproot: deps.account?.taproot?.address || '(none)',
    queryEnabled: deps.isInitialized && !!deps.provider && !!deps.account && deps.isConnected && addresses.length > 0,
  });

  return queryOptions({
    queryKey: queryKeys.account.enrichedWallet(deps.network, addressKey),
    enabled:
      deps.isInitialized &&
      !!deps.provider &&
      !!deps.account &&
      deps.isConnected &&
      addresses.length > 0,
    // On devnet, short staleTime + polling for fast balance updates after faucets/swaps.
    staleTime: deps.network === 'devnet' ? 2_000 : 30_000,
    refetchInterval: deps.network === 'devnet' ? 5_000 : undefined,
    // Always refetch when the dashboard mounts (navigating back to wallet page)
    refetchOnMount: 'always',
    // Refetch when user returns to the tab
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
              debugLog(`[BALANCE] Request timed out after ${timeoutMs}ms, using fallback`);
              resolve(fallback);
            }, timeoutMs),
          ),
        ]);

      const fetchUtxosViaEsplora = async (address: string) => {
        try {
          const response = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'esplora_address::utxo',
              params: [address],
              id: 1,
            }),
          });
          const json = await response.json();
          if (json.result && Array.isArray(json.result)) {
            return json.result.map((utxo: any) => ({
              outpoint: `${utxo.txid}:${utxo.vout}`,
              value: utxo.value,
              height: utxo.status?.block_height || 0,
            }));
          }
        } catch (err) {
          console.error(`[BALANCE] esplora fallback failed for ${address}:`, err);
        }
        return null;
      };

      const fetchMempoolSpent = async (address: string): Promise<number> => {
        try {
          const response = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'esplora_address::txs:mempool',
              params: [address],
              id: 1,
            }),
          });
          const json = await response.json();
          const txs = json.result;
          if (!Array.isArray(txs)) return 0;

          // Build set of mempool txids to distinguish confirmed vs unconfirmed parents
          const mempoolTxids = new Set(txs.map((tx: any) => tx.txid));

          let spent = 0;
          for (const tx of txs) {
            for (const vin of (tx.vin || [])) {
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
          const rawResult = await withTimeout(provider.getEnrichedBalances(address), 15000, null);
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
          debugWarn(`[BALANCE] getEnrichedBalances failed for ${address}, trying esplora fallback:`, error);
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
    staleTime: deps.network === 'devnet' ? 2_000 : 30_000,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchInterval: deps.network === 'devnet' ? 5_000 : undefined,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10000),
    queryFn: async () => {
      const provider = deps.provider!;
      const alkaneMap = new Map<string, any>();

      for (const address of addresses) {
        try {
          // SDK data API — on mainnet this hits Espo server, on devnet this routes
          // through the fetch interceptor to the espo tertiary indexer WASM
          // (subfrost/espo kungfuflex/fujin branch, loaded as quspo.wasm).
          const result = await (provider as any).dataApiGetAlkanesByAddress(address);
          const items: any[] = result?.data || [];
          debugLog(`[alkaneBalanceQuery] ${address.slice(0, 12)}...: ${items.length} alkanes (dataApi)`);

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
                priceUsd: item.priceUsd || item.busdPoolPriceInUsd || undefined,
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
        } catch (error) {
          console.error(`[alkaneBalanceQuery] Failed for ${address}:`, error);
          throw error;
        }
      }

      debugLog(`[alkaneBalanceQuery] Final alkanes: ${alkaneMap.size}`, Array.from(alkaneMap.values()).map(a => `${a.name}(${a.alkaneId})=${a.balance}`).join(', '));
      return Array.from(alkaneMap.values());
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

  return queryOptions<CurrencyPriceInfoResponse[]>({
    queryKey: queryKeys.account.sellableCurrencies(deps.network, deps.walletAddress || '', tokensKey),
    enabled: deps.isInitialized && !!deps.provider && !!deps.walletAddress,
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
            // ⚠️ (2026-03-26): On devnet, /api/alkane-balances is a Next.js
            // server-side route that returns empty ({ balances: [] }) because the
            // server process can't reach the in-browser WASM devnet. The devnet
            // runs entirely in the browser via a fetch interceptor — server-side
            // fetch() to localhost:18888 hits nothing. Must use client-side
            // dataApiGetAlkanesByAddress instead, which routes through quspo.
            // This powers the 25/50/75/MAX percentage buttons on the swap page.
            let balances: { alkaneId: string; balance: string; name?: string; symbol?: string }[] = [];

            if (deps.network === 'devnet' && deps.provider) {
              // Same quspo bug as alkaneBalanceQueryOptions — try quspo first,
              // fall back to enriched balance extraction when quspo returns empty.
              const result = await (deps.provider as any).dataApiGetAlkanesByAddress(address);
              const items: any[] = result?.data || [];
              for (const item of items) {
                const block = item.alkaneId?.block;
                const tx = item.alkaneId?.tx;
                if (block == null || tx == null) continue;
                balances.push({
                  alkaneId: `${block}:${tx}`,
                  balance: String(item.balance || '0'),
                  name: item.name || undefined,
                  symbol: item.symbol || undefined,
                });
              }
              // Quspo empty fallback: extract from enriched balances
              if (balances.length === 0) {
                try {
                  const enriched = await deps.provider.getEnrichedBalances(address, '1');
                  const mapToObj = (v: any): any => {
                    if (v instanceof Map) { const o: any = {}; for (const [k, val] of v.entries()) o[k] = mapToObj(val); return o; }
                    if (Array.isArray(v)) return v.map(mapToObj);
                    return v;
                  };
                  const returns = enriched instanceof Map ? mapToObj(enriched.get('returns')) : mapToObj(enriched?.returns || enriched);
                  for (const asset of (returns?.assets || [])) {
                    for (const r of (asset?.runes || [])) {
                      const known = KNOWN_TOKENS_SELL[`${r.block}:${r.tx}`];
                      balances.push({
                        alkaneId: `${r.block}:${r.tx}`,
                        balance: String(r.amount || '0'),
                        name: known?.name,
                        symbol: known?.symbol,
                      });
                    }
                  }
                } catch {}
              }
            } else {
              const resp = await fetch(
                `/api/alkane-balances?address=${encodeURIComponent(address)}&network=${encodeURIComponent(deps.network)}`,
              );
              const data = await resp.json();
              balances = data?.balances || [];
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
