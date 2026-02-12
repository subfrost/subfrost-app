/**
 * Account / wallet query options.
 *
 * - enrichedWallet: BTC UTXOs + alkane balances (was useEffect, now useQuery)
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
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

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
      obj[k] = mapToObject(v);
    }
    return obj;
  }
  if (Array.isArray(value)) {
    return value.map(mapToObject);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Alkane balance fetcher — server-side route with SDK fallback
// ---------------------------------------------------------------------------

interface AlkaneBalanceEntry {
  alkaneId: string;
  balance: string;
  name?: string;
  symbol?: string;
}

/**
 * Fetch metadata for an alkane token via Espo.
 * Returns name/symbol/decimals or null on failure.
 * Results are cached in-memory for the session.
 */
const alkaneInfoCache = new Map<string, { name: string; symbol: string; decimals: number }>();

async function fetchAlkaneMetadata(
  provider: WebProvider,
  alkaneId: string,
): Promise<{ name: string; symbol: string; decimals: number } | null> {
  // Check KNOWN_TOKENS first
  if (KNOWN_TOKENS[alkaneId]) return KNOWN_TOKENS[alkaneId];

  // Check session cache
  if (alkaneInfoCache.has(alkaneId)) return alkaneInfoCache.get(alkaneId)!;

  try {
    const raw = await provider.espoGetAlkaneInfo(alkaneId);
    const info = raw instanceof Map ? mapToObject(raw) : raw;
    if (info && (info.name || info.symbol)) {
      const metadata = {
        name: info.name || `Token ${alkaneId}`,
        symbol: info.symbol || '',
        decimals: typeof info.decimals === 'number' ? info.decimals : 8,
      };
      alkaneInfoCache.set(alkaneId, metadata);
      return metadata;
    }
  } catch (err) {
    console.warn(`[BALANCE] espoGetAlkaneInfo failed for ${alkaneId}:`, err);
  }
  return null;
}

/**
 * Fetch alkane token balances for an address via Espo indexer.
 *
 * Uses essentials.get_address_balances (espoGetAddressBalances) which is fast
 * and independent of metashrew. Metadata enriched via espoGetAlkaneInfo.
 */
async function fetchAlkaneBalancesForAddress(
  address: string,
  _network: string,
  provider: WebProvider | null,
  timeoutMs: number = 15000,
): Promise<AlkaneBalanceEntry[]> {
  if (!provider) return [];

  const raw = await Promise.race([
    provider.espoGetAddressBalances(address, false),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!raw) return [];

  const result = raw instanceof Map ? mapToObject(raw) : raw;
  const balances: Record<string, string> = result?.balances || {};
  const alkaneIds = Object.keys(balances);

  if (alkaneIds.length === 0) return [];

  // Enrich with metadata (parallel, best-effort)
  const metadataResults = await Promise.all(
    alkaneIds.map((id) => fetchAlkaneMetadata(provider, id)),
  );

  return alkaneIds.map((alkaneId, i) => ({
    alkaneId,
    balance: String(balances[alkaneId] || '0'),
    name: metadataResults[i]?.name,
    symbol: metadataResults[i]?.symbol,
  }));
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

  return queryOptions({
    queryKey: queryKeys.account.enrichedWallet(deps.network, addressKey),
    enabled:
      deps.isInitialized &&
      !!deps.provider &&
      !!deps.account &&
      deps.isConnected &&
      addresses.length > 0,
    queryFn: async () => {
      const provider = deps.provider!;

      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> =>
        Promise.race([
          promise,
          new Promise<T>((resolve) =>
            setTimeout(() => {
              console.log(`[BALANCE] Request timed out after ${timeoutMs}ms, using fallback`);
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

      // Fire all three independent network call groups in parallel:
      // 1. UTXO enrichment (getEnrichedBalances per address)
      // 2. Mempool spent tracking (esplora mempool txs per address)
      // 3. Alkane token balances (server-side API per address)
      const [enrichedResults, mempoolSpentResults, alkaneBalanceResults] = await Promise.all([
        Promise.all(enrichedDataPromises),
        Promise.all(
          addresses.map(async (address) => ({
            address,
            spent: await withTimeout(fetchMempoolSpent(address), 10000, 0),
          })),
        ),
        Promise.all(
          addresses.map((address) => fetchAlkaneBalancesForAddress(address, deps.network, provider)),
        ),
      ]);

      // Process UTXO enrichment results
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
      const alkaneMap = new Map<string, any>();
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
            if (isP2WPKH) p2wpkhBtc += utxo.value;
            else if (isP2TR) p2trBtc += utxo.value;
            totalBtc += utxo.value;
            if (isSpendable) spendableBtc += utxo.value;
            else withAssetsBtc += utxo.value;
          } else {
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

      // Process mempool spent results
      let pendingOutgoingP2wpkh = 0;
      let pendingOutgoingP2tr = 0;
      let pendingOutgoingTotal = 0;
      for (const { address, spent } of mempoolSpentResults) {
        if (address === deps.account.nativeSegwit?.address) pendingOutgoingP2wpkh += spent;
        else if (address === deps.account.taproot?.address) pendingOutgoingP2tr += spent;
        pendingOutgoingTotal += spent;
      }

      // Process alkane balance results
      for (const balances of alkaneBalanceResults) {
        for (const entry of balances) {
          const alkaneIdStr = entry.alkaneId;
          const amountStr = String(entry.balance || '0');
          // Prefer name/symbol from SDK fallback, then KNOWN_TOKENS, then generic
          const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
            symbol: entry.symbol || '',
            name: entry.name || `Token ${alkaneIdStr}`,
            decimals: 8,
          };
          if (!alkaneMap.has(alkaneIdStr)) {
            alkaneMap.set(alkaneIdStr, {
              alkaneId: alkaneIdStr,
              name: entry.name || tokenInfo.name,
              symbol: entry.symbol || tokenInfo.symbol,
              balance: amountStr,
              decimals: tokenInfo.decimals,
            });
          } else {
            const existing = alkaneMap.get(alkaneIdStr)!;
            try {
              existing.balance = (BigInt(existing.balance) + BigInt(amountStr)).toString();
            } catch {
              existing.balance = String(Number(existing.balance) + Number(amountStr));
            }
            // Update name/symbol if SDK provided them and we only had generic names
            if (entry.name && existing.name.startsWith('Token ')) existing.name = entry.name;
            if (entry.symbol && !existing.symbol) existing.symbol = entry.symbol;
          }
        }
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
          alkanes: Array.from(alkaneMap.values()),
          runes: Array.from(runeMap.values()),
        },
        utxos: { p2wpkh: p2wpkhUtxos, p2tr: p2trUtxos, all: allUtxos },
      };
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
            const balances = await fetchAlkaneBalancesForAddress(address, deps.network, deps.provider);

            for (const entry of balances) {
              const alkaneIdStr = entry.alkaneId;
              const balance = String(entry.balance || '0');
              const tokenInfo = KNOWN_TOKENS_SELL[alkaneIdStr] || {
                symbol: entry.symbol || alkaneIdStr.split(':')[1] || '',
                name: entry.name || `Token ${alkaneIdStr}`,
                decimals: 8,
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
