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
          const result = await provider.esploraGetAddressUtxo(address);
          if (result && Array.isArray(result)) {
            return result.map((utxo: any) => ({
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
          const txs = await provider.esploraGetAddressTxsMempool(address);
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

      const enrichedResults = await Promise.all(enrichedDataPromises);

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

      // Fetch mempool spent amounts per address (confirmed UTXOs being spent in mempool)
      const mempoolSpentResults = await Promise.all(
        addresses.map(async (address) => ({
          address,
          spent: await withTimeout(fetchMempoolSpent(address), 10000, 0),
        })),
      );

      let pendingOutgoingP2wpkh = 0;
      let pendingOutgoingP2tr = 0;
      let pendingOutgoingTotal = 0;
      for (const { address, spent } of mempoolSpentResults) {
        if (address === deps.account.nativeSegwit?.address) pendingOutgoingP2wpkh += spent;
        else if (address === deps.account.taproot?.address) pendingOutgoingP2tr += spent;
        pendingOutgoingTotal += spent;
      }

      // Fetch alkane balances via SDK WebProvider (dataApiGetAlkanesByAddress)
      const alkaneBalancePromises = addresses.map(async (address) => {
        try {
          const rawResult = await withTimeout(
            provider.dataApiGetAlkanesByAddress(address),
            15000,
            null,
          );
          if (!rawResult) return;
          const parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
          const items: any[] = parsed?.data || parsed || [];
          for (const entry of items) {
            const alkaneIdStr = entry.alkaneId
              ? `${entry.alkaneId?.block || 0}:${entry.alkaneId?.tx || 0}`
              : '';
            if (!alkaneIdStr) continue;
            const amountStr = String(entry.balance || '0');
            // Use API-provided metadata, fall back to KNOWN_TOKENS, then defaults
            const knownInfo = KNOWN_TOKENS[alkaneIdStr];
            const name = entry.name || knownInfo?.name || `Token ${alkaneIdStr}`;
            const symbol = entry.symbol || knownInfo?.symbol || '';
            const decimals = knownInfo?.decimals ?? 8;
            if (!alkaneMap.has(alkaneIdStr)) {
              alkaneMap.set(alkaneIdStr, {
                alkaneId: alkaneIdStr,
                name,
                symbol,
                balance: amountStr,
                decimals,
                logo: entry.tokenImage || undefined,
                priceUsd: entry.priceUsd || undefined,
                priceInSatoshi: entry.priceInSatoshi ? Number(entry.priceInSatoshi) : undefined,
              });
            } else {
              const existing = alkaneMap.get(alkaneIdStr)!;
              try {
                existing.balance = (BigInt(existing.balance) + BigInt(amountStr)).toString();
              } catch {
                existing.balance = String(Number(existing.balance) + Number(amountStr));
              }
              // Merge metadata if the existing entry has no name/symbol yet
              if (!existing.name || existing.name.startsWith('Token ')) {
                if (name && !name.startsWith('Token ')) existing.name = name;
              }
              if (!existing.symbol && symbol) existing.symbol = symbol;
              if (!existing.priceUsd && entry.priceUsd) existing.priceUsd = entry.priceUsd;
              if (!existing.priceInSatoshi && entry.priceInSatoshi) existing.priceInSatoshi = Number(entry.priceInSatoshi);
              if (!existing.logo && entry.tokenImage) existing.logo = entry.tokenImage;
            }
          }
        } catch (error) {
          console.error(`[BALANCE] dataApiGetAlkanesByAddress failed for ${address}:`, error);
        }
      });
      await Promise.all(alkaneBalancePromises);

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

        const provider = deps.provider!;
        const sellBalancePromises = addresses.map(async (address) => {
          try {
            const rawResult = await provider.dataApiGetAlkanesByAddress(address);
            const parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
            const items: any[] = parsed?.data || parsed || [];

            for (const entry of items) {
              const alkaneIdStr = entry.alkaneId
                ? `${entry.alkaneId?.block || 0}:${entry.alkaneId?.tx || 0}`
                : '';
              if (!alkaneIdStr) continue;
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
            console.error(`[sellableCurrencies] dataApiGetAlkanesByAddress failed for ${address}:`, error);
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
