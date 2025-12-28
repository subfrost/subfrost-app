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
      bitcoin: { p2wpkh: 0, p2tr: 0, total: 0 },
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
      const allUtxos: EnrichedUTXO[] = [];
      const p2wpkhUtxos: EnrichedUTXO[] = [];
      const p2trUtxos: EnrichedUTXO[] = [];
      const alkaneMap = new Map<string, AlkaneAsset>();
      const runeMap = new Map<string, any>();

      for (const { address, data } of enrichedResults) {
        if (!data) continue;

        const isP2WPKH = address === account.nativeSegwit?.address;
        const isP2TR = address === account.taproot?.address;

        // Helper function to process a UTXO from any category
        const processUtxo = (utxo: any, isConfirmed: boolean) => {
          // balances.lua returns outpoint as "txid:vout" format
          const [txid, voutStr] = (utxo.outpoint || ':').split(':');
          const vout = parseInt(voutStr || '0', 10);

          const enrichedUtxo: EnrichedUTXO = {
            txid,
            vout,
            value: utxo.value,
            address: address,
            status: {
              confirmed: isConfirmed,
              block_height: utxo.height,
            },
            alkanes: utxo.alkanes,
            inscriptions: utxo.inscriptions,
            runes: utxo.runes,
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

          // Aggregate alkanes
          if (utxo.alkanes) {
            for (const [alkaneId, alkaneData] of Object.entries(utxo.alkanes)) {
              const data = alkaneData as any; // Type assertion for alkane data
              if (!alkaneMap.has(alkaneId)) {
                alkaneMap.set(alkaneId, {
                  alkaneId,
                  name: data.name || alkaneId,
                  symbol: data.symbol || alkaneId.split(':')[1] || 'ALK',
                  balance: data.value,
                  decimals: data.decimals || 8,
                });
              } else {
                const existing = alkaneMap.get(alkaneId)!;
                // Add balances (assuming they're strings representing numbers)
                const currentBalance = BigInt(existing.balance);
                const additionalBalance = BigInt(data.value);
                existing.balance = (currentBalance + additionalBalance).toString();
              }
            }
          }

          // Aggregate runes
          if (utxo.runes) {
            for (const [runeId, runeData] of Object.entries(utxo.runes)) {
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

        // Process spendable UTXOs (confirmed, no assets)
        for (const utxo of toArray(data.spendable)) {
          processUtxo(utxo, true);
        }

        // Process asset UTXOs (confirmed, have inscriptions/runes/alkanes)
        for (const utxo of toArray(data.assets)) {
          processUtxo(utxo, true);
        }

        // Process pending UTXOs (unconfirmed)
        for (const utxo of toArray(data.pending)) {
          processUtxo(utxo, false);
        }
      }

      // Process protorune/alkane balances from protorunesbyaddress (PRIMARY source)
      // Clear any alkanes from the Lua script and use protorunesbyaddress as the source of truth
      alkaneMap.clear();

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

      // NOTE: We skip alkanesReflect() for token metadata because the indexer can return
      // stale/incorrect data. Instead, we rely on KNOWN_TOKENS which has verified values.
      // Remember: 2:0 is ALWAYS DIESEL on all networks. bUSD is 2:56801 on mainnet only.

      // Log final frBTC balance for debugging wrap issue
      // Check both possible frBTC IDs (4:0 on regtest, 32:0 on mainnet)
      const frbtcAsset = alkaneMap.get('4:0') || alkaneMap.get('32:0');
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
