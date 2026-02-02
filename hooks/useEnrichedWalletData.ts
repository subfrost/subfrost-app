/**
 * useEnrichedWalletData - Fetches enriched wallet data including UTXOs and alkane balances
 *
 * Flow:
 * 1. provider.getEnrichedBalances(address) - Calls balances.lua for UTXOs + inscriptions + runes
 * 2. fetchAlkaneBalances(address) - OYL Alkanode REST API for alkane token balances
 *    (replaces old alkanes_protorunesbyaddress RPC which returned 0x on regtest)
 *
 * JOURNAL ENTRY (2026-01-30):
 * Replaced alkanes_protorunesbyaddress with OYL Alkanode REST API (/get-alkanes-by-address)
 * for alkane balance fetching. The Lua script no longer includes protorune data; alkane
 * balances are fetched directly from the OYL API which is more reliable.
 *
 * JOURNAL ENTRY (2026-01-28):
 * RESTORED esplora fallback for BTC balance fetching. The `enrichedbalances` lua view
 * function is not deployed on the regtest indexer, causing getEnrichedBalances() to fail
 * and BTC balances to show as 0. The fallback uses `esplora_address::utxo` RPC which
 * works reliably on all environments.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';
import { getConfig, fetchAlkaneBalances } from '@/utils/getConfig';

// Helper to recursively convert Map to plain object (serde_wasm_bindgen returns Maps)
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

export interface AlkaneAsset {
  alkaneId: string;
  name: string;
  symbol: string;
  balance: string;
  decimals: number;
  logo?: string; // URL to token logo if available
  priceUsd?: number; // Per-unit price in USD (from OYL Alkanode)
  priceInSatoshi?: number; // Per-unit price in satoshis (from OYL Alkanode)
}

export interface EnrichedUTXO {
  txid: string;
  vout: number;
  value: number;
  address: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  // Alkanes data
  alkanes?: Record<string, {
    value: string;
    name: string;
    symbol: string;
    decimals?: number;
  }>;
  // Inscriptions
  inscriptions?: Array<{
    id: string;
    number: number;
  }>;
  // Runes
  runes?: Record<string, {
    amount: string;
    symbol: string;
    divisibility: number;
  }>;
}

export interface WalletBalances {
  bitcoin: {
    p2wpkh: number;
    p2tr: number;
    total: number;
    spendable: number;    // Plain BTC UTXOs (no assets) from both address types
    withAssets: number;   // BTC in UTXOs with assets from both address types
  };
  pendingTxCount: {
    p2wpkh: number;       // Pending transaction count for Native SegWit address
    p2tr: number;         // Pending transaction count for Taproot address
  };
  alkanes: AlkaneAsset[];
  runes: Array<{
    id: string;
    symbol: string;
    balance: string;
    divisibility: number;
  }>;
}

export interface EnrichedWalletData {
  balances: WalletBalances;
  utxos: {
    p2wpkh: EnrichedUTXO[];
    p2tr: EnrichedUTXO[];
    all: EnrichedUTXO[];
  };
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and enrich wallet data using alkanes-web-sys provider
 * This combines Bitcoin UTXOs with alkanes/runes/inscriptions data
 */
export function useEnrichedWalletData(): EnrichedWalletData {
  const { account, isConnected, network } = useWallet() as any;
  const { provider, isInitialized } = useAlkanesSDK();

  const [data, setData] = useState<Omit<EnrichedWalletData, 'refresh'>>({
    balances: {
      bitcoin: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0, withAssets: 0 },
      pendingTxCount: { p2wpkh: 0, p2tr: 0 },
      alkanes: [],
      runes: [],
    },
    utxos: {
      p2wpkh: [],
      p2tr: [],
      all: [],
    },
    isLoading: true,
    error: null,
  });

  const fetchEnrichedData = useCallback(async () => {
    if (!provider || !isInitialized || !account || !isConnected) {
      setData(prev => ({ ...prev, isLoading: false }));
      return;
    }

    setData(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const addresses = [];
      if (account.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
      if (account.taproot?.address) addresses.push(account.taproot.address);

      if (addresses.length === 0) {
        throw new Error('No wallet addresses available');
      }

      // Helper: timeout wrapper for slow RPC calls
      const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((resolve) => setTimeout(() => {
            console.log(`[BALANCE] Request timed out after ${timeoutMs}ms, using fallback`);
            resolve(fallback);
          }, timeoutMs))
        ]);
      };

      // Fallback: fetch UTXOs via API proxy when lua scripts are unavailable
      // Uses /api/rpc proxy to bypass CORS restrictions on regtest.subfrost.io
      const fetchUtxosViaEsplora = async (address: string) => {
        try {
          // Use the API proxy route to bypass CORS
          const response = await fetch('/api/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'esplora_address::utxo',
              params: [address],
              id: 1
            })
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

      // Use provider methods (lua scripts) for balance fetching
      // This is the production-aligned flow that works identically across all networks
      const enrichedDataPromises = addresses.map(async (address) => {
        try {
          // Try getEnrichedBalances with a 15 second timeout (regtest can be slow)
          const rawResult = await withTimeout(
            provider.getEnrichedBalances(address),
            15000,
            null
          );

          // If timeout or null, fallback to simple esplora UTXOs
          if (!rawResult) {
            throw new Error('getEnrichedBalances returned null/timeout');
          }

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
              data: {
                spendable: [],
                assets: [],
                pending: [],
                ordHeight: 0,
                metashrewHeight: 0
              }
            };
          }

          return { address, data: enrichedData };
        } catch (error) {
          // Fallback to esplora when lua scripts are unavailable (e.g., regtest without balances.lua)
          console.warn(`[BALANCE] getEnrichedBalances failed for ${address}, trying esplora fallback:`, error);
          try {
            const spendable = await fetchUtxosViaEsplora(address);
            if (spendable && spendable.length > 0) {
              console.log(`[BALANCE] Esplora fallback succeeded for ${address}:`, spendable.length, 'UTXOs');
              return {
                address,
                data: {
                  spendable,
                  assets: [],
                  pending: [],
                  ordHeight: 0,
                  metashrewHeight: 0
                }
              };
            }
          } catch (fallbackError) {
            console.error(`[BALANCE] Esplora fallback also failed for ${address}:`, fallbackError);
          }
          return { address, data: null };
        }
      });

      const enrichedResults = await Promise.all(enrichedDataPromises);

      // Process results
      let totalBtc = 0;
      let p2wpkhBtc = 0;
      let p2trBtc = 0;
      let spendableBtc = 0;    // Plain BTC (no assets) from both address types
      let withAssetsBtc = 0;   // BTC in UTXOs with assets from both address types
      const allUtxos: EnrichedUTXO[] = [];
      const p2wpkhUtxos: EnrichedUTXO[] = [];
      const p2trUtxos: EnrichedUTXO[] = [];
      const alkaneMap = new Map<string, AlkaneAsset>();
      const runeMap = new Map<string, any>();
      // Track unique pending transaction IDs per address type
      const pendingTxIdsP2wpkh = new Set<string>();
      const pendingTxIdsP2tr = new Set<string>();

      for (const { address, data } of enrichedResults) {
        if (!data) continue;

        const isP2WPKH = address === account.nativeSegwit?.address;
        const isP2TR = address === account.taproot?.address;

        // Helper function to process a UTXO from any category
        // isSpendable: true for plain BTC UTXOs, false for UTXOs with assets
        const processUtxo = (utxo: any, isConfirmed: boolean, isSpendable: boolean) => {
          // balances.lua returns outpoint as "txid:vout" format
          const [txid, voutStr] = (utxo.outpoint || ':').split(':');
          const vout = parseInt(voutStr || '0', 10);

          // balances.lua returns:
          // - utxo.ord_runes: regular Runes from ord_outputs (this is what the UI expects as "runes")
          // - utxo.inscriptions: inscriptions from ord_outputs
          // Alkane balances are fetched separately via OYL Alkanode API (not per-UTXO)

          const enrichedUtxo: EnrichedUTXO = {
            txid,
            vout,
            value: utxo.value,
            address: address,
            status: {
              confirmed: isConfirmed,
              block_height: utxo.height,
            },
            inscriptions: utxo.inscriptions,
            runes: utxo.ord_runes,
          };

          allUtxos.push(enrichedUtxo);

          if (isP2WPKH) {
            p2wpkhUtxos.push(enrichedUtxo);
            p2wpkhBtc += utxo.value;
          } else if (isP2TR) {
            p2trUtxos.push(enrichedUtxo);
            p2trBtc += utxo.value;
          }

          totalBtc += utxo.value;

          // Track spendable vs with-assets BTC separately
          if (isSpendable) {
            spendableBtc += utxo.value;
          } else {
            withAssetsBtc += utxo.value;
          }

          // Track pending transaction IDs per address type
          if (!isConfirmed && txid) {
            if (isP2WPKH) {
              pendingTxIdsP2wpkh.add(txid);
            } else if (isP2TR) {
              pendingTxIdsP2tr.add(txid);
            }
          }

          // Aggregate runes (use ord_runes from balances.lua, which contains regular Runes)
          if (utxo.ord_runes) {
            for (const [runeId, runeData] of Object.entries(utxo.ord_runes)) {
              const data = runeData as any; // Type assertion for rune data
              if (!runeMap.has(runeId)) {
                runeMap.set(runeId, {
                  id: runeId,
                  symbol: data.symbol,
                  balance: data.amount,
                  divisibility: data.divisibility,
                });
              } else {
                const existing = runeMap.get(runeId)!;
                const currentBalance = BigInt(existing.balance);
                const additionalBalance = BigInt(data.amount);
                existing.balance = (currentBalance + additionalBalance).toString();
              }
            }
          }
        };

        // Helper to convert lua table to array (empty {} becomes [], arrays stay arrays)
        const toArray = (val: any): any[] => {
          if (Array.isArray(val)) return val;
          if (val && typeof val === 'object' && Object.keys(val).length > 0) {
            // Lua tables with numeric keys become objects, convert to array
            return Object.values(val);
          }
          return [];
        };

        // Process spendable UTXOs (confirmed, no assets) - these are plain BTC
        for (const utxo of toArray(data.spendable)) {
          processUtxo(utxo, true, true);
        }

        // Process asset UTXOs (confirmed, have inscriptions/runes/alkanes) - these have assets
        for (const utxo of toArray(data.assets)) {
          processUtxo(utxo, true, false);
        }

        // Process pending UTXOs (unconfirmed) - treat as unspendable until confirmed
        for (const utxo of toArray(data.pending)) {
          processUtxo(utxo, false, false);
        }
      }

      // Fetch alkane balances via OYL Alkanode REST API (/get-alkanes-by-address)
      const config = getConfig(network || 'mainnet');
      for (const address of addresses) {
        try {
          const alkaneBalances = await withTimeout(
            fetchAlkaneBalances(address, config.OYL_ALKANODE_URL),
            15000,
            []
          );

          for (const entry of alkaneBalances) {
            const alkaneIdStr = `${entry.alkaneId.block}:${entry.alkaneId.tx}`;
            const amountStr = String(entry.balance || '0');

            const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
              symbol: entry.symbol || `${entry.alkaneId.tx}`,
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
              const currentBalance = BigInt(existing.balance);
              const additionalBalance = BigInt(amountStr);
              existing.balance = (currentBalance + additionalBalance).toString();
            }
          }
        } catch (error) {
          console.error(`[BALANCE] OYL Alkanode API failed for ${address}:`, error);
        }
      }

      // Log final frBTC balance for debugging wrap issue
      // frBTC is always 32:0 on all networks
      const frbtcAsset = alkaneMap.get('32:0');
      if (frbtcAsset) {
        console.log('[BALANCE] frBTC from protorunes:', frbtcAsset.alkaneId, '=', frbtcAsset.balance);
      } else {
        console.log('[BALANCE] No frBTC found. Available alkanes:', Array.from(alkaneMap.keys()));
      }

      setData({
        balances: {
          bitcoin: {
            p2wpkh: p2wpkhBtc,
            p2tr: p2trBtc,
            total: totalBtc,
            spendable: spendableBtc,
            withAssets: withAssetsBtc,
          },
          pendingTxCount: {
            p2wpkh: pendingTxIdsP2wpkh.size,
            p2tr: pendingTxIdsP2tr.size,
          },
          alkanes: Array.from(alkaneMap.values()),
          runes: Array.from(runeMap.values()),
        },
        utxos: {
          p2wpkh: p2wpkhUtxos,
          p2tr: p2trUtxos,
          all: allUtxos,
        },
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch enriched wallet data:', error);
      setData(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch wallet data',
      }));
    }
  }, [provider, isInitialized, account, isConnected, network]);

  // Initial fetch
  useEffect(() => {
    fetchEnrichedData();
  }, [fetchEnrichedData]);

  return {
    ...data,
    refresh: fetchEnrichedData,
  };
}
