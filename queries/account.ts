/**
 * Account / wallet query options.
 *
 * - enrichedWallet: BTC UTXOs + alkane balances (was useEffect, now useQuery)
 * - btcBalance: spendable BTC satoshis
 * - sellableCurrencies: alkane tokens the wallet holds
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

interface EnrichedWalletDeps {
  provider: WebProvider | null;
  isInitialized: boolean;
  account: any;
  isConnected: boolean;
  network: string;
  fetchAlkaneBalances: (address: string, url: string) => Promise<any[]>;
  alkanodeUrl: string;
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

      const enrichedResults = await Promise.all(enrichedDataPromises);

      let totalBtc = 0;
      let p2wpkhBtc = 0;
      let p2trBtc = 0;
      let spendableBtc = 0;
      let withAssetsBtc = 0;
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
          if (isP2WPKH) { p2wpkhUtxos.push(enrichedUtxo); p2wpkhBtc += utxo.value; }
          else if (isP2TR) { p2trUtxos.push(enrichedUtxo); p2trBtc += utxo.value; }
          totalBtc += utxo.value;
          if (isSpendable) spendableBtc += utxo.value;
          else withAssetsBtc += utxo.value;
          if (!isConfirmed && txid) {
            if (isP2WPKH) pendingTxIdsP2wpkh.add(txid);
            else if (isP2TR) pendingTxIdsP2tr.add(txid);
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

      // Fetch alkane balances via OYL Alkanode
      for (const address of addresses) {
        try {
          const alkaneBalances = await withTimeout(
            deps.fetchAlkaneBalances(address, deps.alkanodeUrl),
            15000,
            [],
          );
          for (const entry of alkaneBalances) {
            const alkaneIdStr = `${entry.alkaneId.block}:${entry.alkaneId.tx}`;
            const amountStr = String(entry.balance || '0');
            const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
              symbol: entry.symbol || '',
              name: entry.name || `Token ${alkaneIdStr}`,
              decimals: 8,
            };
            if (!alkaneMap.has(alkaneIdStr)) {
              alkaneMap.set(alkaneIdStr, {
                alkaneId: alkaneIdStr,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                balance: amountStr,
                decimals: tokenInfo.decimals,
                priceUsd: entry.priceUsd ? Number(entry.priceUsd) : undefined,
                priceInSatoshi: entry.priceInSatoshi ? Number(entry.priceInSatoshi) : undefined,
              });
            } else {
              const existing = alkaneMap.get(alkaneIdStr)!;
              existing.balance = (BigInt(existing.balance) + BigInt(amountStr)).toString();
            }
          }
        } catch (error) {
          console.error(`[BALANCE] OYL Alkanode API failed for ${address}:`, error);
        }
      }

      return {
        balances: {
          bitcoin: { p2wpkh: p2wpkhBtc, p2tr: p2trBtc, total: totalBtc, spendable: spendableBtc, withAssets: withAssetsBtc },
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
  fetchAlkaneBalances: (address: string, url: string) => Promise<any[]>;
  alkanodeUrl: string;
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

        for (const address of addresses) {
          try {
            const alkaneBalances = await deps.fetchAlkaneBalances(address, deps.alkanodeUrl);

            for (const entry of alkaneBalances) {
              const alkaneIdStr = `${entry.alkaneId.block}:${entry.alkaneId.tx}`;
              const balance = String(entry.balance || '0');
              const tokenInfo = KNOWN_TOKENS_SELL[alkaneIdStr] || {
                symbol: entry.symbol || `${entry.alkaneId.tx}`,
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
                    price: Number(entry.priceUsd || 0),
                    idClubMarketplace: entry.idClubMarketplace || false,
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
            console.error(`[sellableCurrencies] OYL API failed for ${address}:`, error);
          }
        }

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
