import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { KNOWN_TOKENS } from '@/lib/alkanes-client';

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
  const { account, isConnected } = useWallet() as any;
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

      // Use provider methods instead of direct fetch
      const enrichedDataPromises = addresses.map(async (address) => {
        try {
          // Get enriched balances using WASM WebProvider's balances.lua method
          const rawResult = await provider.getEnrichedBalances(address);

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
          console.error(`[BALANCE] Failed to fetch enriched data for ${address}:`, error);
          return { address, data: null };
        }
      });

      // Fetch protorune/alkane balances via alkanesByAddress
      // This is the primary source of truth for protorune assets (frBTC)
      const protorunePromises = addresses.map(async (address) => {
        try {
          const rawResult = await provider.alkanesByAddress(address, 'latest', 1);

          console.log('[useEnrichedWalletData] Raw alkanesByAddress result type:', typeof rawResult);
          console.log('[useEnrichedWalletData] Raw result is Map:', rawResult instanceof Map);
          console.log('[useEnrichedWalletData] Raw result keys:', rawResult ? Object.keys(rawResult) : 'null');
          console.log('[useEnrichedWalletData] Raw result:', JSON.stringify(rawResult, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)?.slice(0, 2000));

          const result = mapToObject(rawResult);
          console.log('[BALANCE] alkanesByAddress raw for', address, ':', JSON.stringify(result, null, 2));
          return { address, data: result };
        } catch (error) {
          console.error(`[BALANCE] Failed to fetch protorunes for ${address}:`, error);
          return { address, data: null };
        }
      });

      // Also try alkanesBalance as a simpler fallback (returns aggregated balances)
      const alkanesBalancePromises = addresses.map(async (address) => {
        try {
          console.log('[useEnrichedWalletData] Fetching alkanesBalance for:', address);
          const rawResult = await provider.alkanesBalance(address);
          const result = mapToObject(rawResult);
          console.log('[useEnrichedWalletData] alkanesBalance result for', address, result);
          return { address, data: result };
        } catch (error) {
          console.error(`[useEnrichedWalletData] Failed to fetch alkanesBalance for ${address}:`, error);
          return { address, data: null };
        }
      });

      const [enrichedResults, protoruneResults, alkanesBalanceResults] = await Promise.all([
        Promise.all(enrichedDataPromises),
        Promise.all(protorunePromises),
        Promise.all(alkanesBalancePromises),
      ]);

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

          // Note: balances.lua returns:
          // - utxo.runes: protorunes from alkanes_protorunesbyaddress (we enrich from protoruneResults later)
          // - utxo.ord_runes: regular Runes from ord_outputs (this is what the UI expects as "runes")
          // - utxo.inscriptions: inscriptions from ord_outputs
          const enrichedUtxo: EnrichedUTXO = {
            txid,
            vout,
            value: utxo.value,
            address: address,
            status: {
              confirmed: isConfirmed,
              block_height: utxo.height,
            },
            // alkanes will be enriched later from protoruneResults
            alkanes: undefined,
            inscriptions: utxo.inscriptions,
            // Use ord_runes for regular Runes (not utxo.runes which is protorunes)
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

          // Note: Alkanes are NOT aggregated here from balances.lua response
          // because the lua returns protorunes as 'runes' field, not 'alkanes'.
          // Alkanes are aggregated separately from protoruneResults (alkanesByAddress).

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

        // Process pending UTXOs (unconfirmed) - treat as spendable for now
        for (const utxo of toArray(data.pending)) {
          processUtxo(utxo, false, true);
        }
      }

      // Process protorune/alkane balances from protorunesbyaddress (PRIMARY source)
      // Clear any alkanes from the Lua script and use protorunesbyaddress as the source of truth
      alkaneMap.clear();

      // Build a map of outpoint -> alkanes data for UTXO enrichment
      const utxoAlkanesMap = new Map<string, Record<string, { value: string; name: string; symbol: string; decimals?: number }>>();

      for (const { address, data } of protoruneResults) {
        if (!data) continue;

        // Log the actual data structure to understand what format we're getting
        console.log('[BALANCE] alkanesByAddress data structure:', {
          hasOutpoints: !!data.outpoints,
          hasBalances: !!data.balances,
          keys: Object.keys(data),
        });

        // The RPC alkanes_protorunesbyaddress returns outpoints with runes array
        // Format: { outpoints: [{ outpoint: "txid:vout", runes: [{ balance: "123", rune: { name: "SUBFROST BTC", id: { block: "0x20", tx: "0x0" } } }] }] }
        const outpoints = data.outpoints || [];

        for (const outpoint of outpoints) {
          const runes = outpoint.runes || [];
          const outpointKey = outpoint.outpoint; // "txid:vout" format

          for (const runeEntry of runes) {
            const rune = runeEntry.rune;
            if (!rune) continue;

            // Build alkane ID from block:tx (hex values like "0x20")
            // parseInt with 0x prefix needs no radix, or we strip the prefix
            const blockStr = rune.id?.block || '0';
            const txStr = rune.id?.tx || '0';
            const block = blockStr.startsWith('0x') ? parseInt(blockStr) : parseInt(blockStr, 16);
            const tx = txStr.startsWith('0x') ? parseInt(txStr) : parseInt(txStr, 16);
            const alkaneIdStr = `${block}:${tx}`;

            console.log('[BALANCE] Parsing rune ID:', { blockStr, txStr, block, tx, alkaneIdStr });

            // Balance might be a string, number, or object with value property
            let balance = '0';
            if (typeof runeEntry.balance === 'string') {
              balance = runeEntry.balance;
            } else if (typeof runeEntry.balance === 'number') {
              balance = runeEntry.balance.toString();
            } else if (runeEntry.balance?.value) {
              balance = String(runeEntry.balance.value);
            }

            // Get token metadata from KNOWN_TOKENS or use rune name
            const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
              symbol: rune.name || alkaneIdStr.split(':')[1] || 'ALK',
              name: rune.name || `Token ${alkaneIdStr}`,
              decimals: 8,
            };

            console.log('[BALANCE] Found protorune:', alkaneIdStr, '=', balance, 'raw:', runeEntry.balance, 'name:', rune.name);

            // Add to UTXO alkanes map for enrichment
            if (outpointKey) {
              if (!utxoAlkanesMap.has(outpointKey)) {
                utxoAlkanesMap.set(outpointKey, {});
              }
              const utxoAlkanes = utxoAlkanesMap.get(outpointKey)!;
              utxoAlkanes[alkaneIdStr] = {
                value: balance,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                decimals: tokenInfo.decimals,
              };
            }

            if (!alkaneMap.has(alkaneIdStr)) {
              alkaneMap.set(alkaneIdStr, {
                alkaneId: alkaneIdStr,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                balance: balance,
                decimals: tokenInfo.decimals,
              });
            } else {
              // Aggregate balance from multiple UTXOs/addresses
              const existing = alkaneMap.get(alkaneIdStr)!;
              const currentBalance = BigInt(existing.balance);
              const additionalBalance = BigInt(balance);
              existing.balance = (currentBalance + additionalBalance).toString();
            }
          }
        }

        // Fallback: Also check the old balance_sheet format in case the SDK returns that
        const balances = data.balances || [];
        for (const entry of balances) {
          const tokenBalances = entry.balance_sheet?.cached?.balances || {};
          const tokenEntries = Object.entries(tokenBalances);

          for (const [alkaneIdStr, amount] of tokenEntries) {
            const amountStr = String(amount);
            const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
              symbol: alkaneIdStr.split(':')[1] || 'ALK',
              name: `Token ${alkaneIdStr}`,
              decimals: 8,
            };

            console.log('[BALANCE] Found balance_sheet entry:', alkaneIdStr, '=', amountStr);

            if (!alkaneMap.has(alkaneIdStr)) {
              alkaneMap.set(alkaneIdStr, {
                alkaneId: alkaneIdStr,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                balance: amountStr,
                decimals: tokenInfo.decimals,
              });
            } else {
              const existing = alkaneMap.get(alkaneIdStr)!;
              const currentBalance = BigInt(existing.balance);
              const additionalBalance = BigInt(amountStr);
              existing.balance = (currentBalance + additionalBalance).toString();
            }
          }
        }
      }

      // Fallback: If alkanesByAddress didn't return data, try alkanesBalance (simpler aggregated format)
      // alkanesBalance returns: [{ alkane_id: { block, tx }, balance: "amount" }, ...]
      if (alkaneMap.size === 0) {
        console.log('[BALANCE] No alkanes from alkanesByAddress, trying alkanesBalance fallback');
        for (const { address, data } of alkanesBalanceResults) {
          if (!data || !Array.isArray(data)) {
            continue;
          }

          for (const entry of data) {
            // Handle both alkane_id and id field names
            const alkaneId = entry.alkane_id || entry.id;
            if (!alkaneId) continue;

            const alkaneIdStr = `${alkaneId.block}:${alkaneId.tx}`;
            const amountStr = String(entry.balance || entry.amount || '0');

            const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
              symbol: entry.symbol || `${alkaneId.tx}`,
              name: entry.name || `Token ${alkaneIdStr}`,
              decimals: entry.decimals || 8,
            };

            if (!alkaneMap.has(alkaneIdStr)) {
              alkaneMap.set(alkaneIdStr, {
                alkaneId: alkaneIdStr,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                balance: amountStr,
                decimals: tokenInfo.decimals,
              });
            } else {
              const existing = alkaneMap.get(alkaneIdStr)!;
              const currentBalance = BigInt(existing.balance);
              const additionalBalance = BigInt(amountStr);
              existing.balance = (currentBalance + additionalBalance).toString();
            }
          }
        }
      }

      // Enrich UTXOs with alkanes data from protoruneResults
      // This ensures UTXOs have their alkanes property populated for filtering
      console.log('[BALANCE] Enriching UTXOs with alkanes data. utxoAlkanesMap size:', utxoAlkanesMap.size);
      for (const utxo of allUtxos) {
        const outpointKey = `${utxo.txid}:${utxo.vout}`;
        const alkanes = utxoAlkanesMap.get(outpointKey);
        if (alkanes && Object.keys(alkanes).length > 0) {
          utxo.alkanes = alkanes;
          console.log('[BALANCE] Enriched UTXO', outpointKey, 'with alkanes:', Object.keys(alkanes));
        }
      }

      // NOTE: We skip alkanesReflect() for token metadata because the indexer can return
      // stale/incorrect data. Instead, we rely on KNOWN_TOKENS which has verified values.
      // Remember: 2:0 is ALWAYS DIESEL on all networks. bUSD is 2:56801 on mainnet only.

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
  }, [provider, isInitialized, account, isConnected]);

  // Initial fetch
  useEffect(() => {
    fetchEnrichedData();
  }, [fetchEnrichedData]);

  return {
    ...data,
    refresh: fetchEnrichedData,
  };
}
