import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

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

      console.log('[useEnrichedWalletData] Fetching balances for addresses:', addresses);

      // Use provider methods instead of direct fetch
      const enrichedDataPromises = addresses.map(async (address) => {
        try {
          console.log('[useEnrichedWalletData] Fetching enriched balances for:', address);

          // Get enriched balances using WASM WebProvider's balances.lua method
          // This returns spendable, assets, pending UTXOs with alkanes/runes/inscriptions data
          const rawResult = await provider.getEnrichedBalances(address);

          console.log('[useEnrichedWalletData] Got raw result for', address, rawResult);

          // The lua evalscript returns {calls, returns, runtime} - we need the .returns field
          // which contains {spendable, assets, pending, ordHeight, metashrewHeight}
          // Note: serde_wasm_bindgen returns Maps, not plain objects, so we need to handle both
          let enrichedData: any;
          if (rawResult instanceof Map) {
            const returns = rawResult.get('returns');
            // Convert Map to plain object recursively
            enrichedData = mapToObject(returns);
          } else {
            enrichedData = rawResult?.returns || rawResult;
          }

          console.log('[useEnrichedWalletData] Extracted enriched data for', address, enrichedData);

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
          console.error(`[useEnrichedWalletData] Failed to fetch data for ${address}:`, error);
          return { address, data: null };
        }
      });

      const enrichedResults = await Promise.all(enrichedDataPromises);

      // Process results
      let totalBtc = 0;
      let p2wpkhBtc = 0;
      let p2trBtc = 0;
      const allUtxos: EnrichedUTXO[] = [];
      const p2wpkhUtxos: EnrichedUTXO[] = [];
      const p2trUtxos: EnrichedUTXO[] = [];
      const alkaneMap = new Map<string, AlkaneAsset>();
      const runeMap = new Map<string, any>();

      console.log('[useEnrichedWalletData] Processing enrichedResults:', enrichedResults);

      for (const { address, data } of enrichedResults) {
        console.log('[useEnrichedWalletData] Processing address:', address, 'data:', data);
        if (!data) continue;

        const isP2WPKH = address === account.nativeSegwit?.address;
        const isP2TR = address === account.taproot?.address;
        console.log('[useEnrichedWalletData] isP2WPKH:', isP2WPKH, 'isP2TR:', isP2TR);
        console.log('[useEnrichedWalletData] data.spendable:', data.spendable, 'type:', typeof data.spendable, 'isArray:', Array.isArray(data.spendable));

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
