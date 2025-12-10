import { useQuery } from '@tanstack/react-query';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';

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

// Helper to extract enriched data from WASM provider response
function extractEnrichedData(rawResult: any): { spendable: any[]; assets: any[]; pending: any[] } | null {
  if (!rawResult) return null;

  let enrichedData: any;
  if (rawResult instanceof Map) {
    const returns = rawResult.get('returns');
    enrichedData = mapToObject(returns);
  } else {
    enrichedData = rawResult?.returns || rawResult;
  }

  if (!enrichedData) return null;

  const toArray = (val: any): any[] => {
    if (Array.isArray(val)) return val.map(mapToObject);
    if (val && typeof val === 'object' && Object.keys(val).length > 0) {
      return Object.values(val).map(mapToObject);
    }
    return [];
  };

  return {
    spendable: toArray(enrichedData.spendable),
    assets: toArray(enrichedData.assets),
    pending: toArray(enrichedData.pending),
  };
}

export const useSellableCurrencies = (
  walletAddress?: string,
  tokensWithPools?: { id: string; name?: string }[],
) => {
  const { provider, isInitialized } = useAlkanesSDK();
  const { network } = useWallet();
  const config = getConfig(network);

  return useQuery({
    queryKey: ['sellable-currencies', walletAddress, tokensWithPools],
    staleTime: 0, // Always refetch - no caching to ensure latest balance
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: isInitialized && !!provider && !!walletAddress,
    queryFn: async (): Promise<CurrencyPriceInfoResponse[]> => {
      if (!walletAddress || !provider) return [];

      console.log('[useSellableCurrencies] Fetching for address:', walletAddress);
      console.log('[useSellableCurrencies] Network:', network);
      console.log('[useSellableCurrencies] Config:', config);

      try {
        // Use WASM provider to get enriched balances which includes alkane tokens
        const rawResult = await provider.getEnrichedBalances(walletAddress, '1');
        const enriched = extractEnrichedData(rawResult);

        const allAlkanes: CurrencyPriceInfoResponse[] = [];
        const seenIds = new Set<string>();

        // Also fetch protorune balance sheet from data API
        // This is needed because frBTC and other protorunes are tracked in the balance sheet,
        // not as asset data on UTXOs
        try {
          const dataApiUrl = (config as any).API_URL;
          console.log('[useSellableCurrencies] Data API URL:', dataApiUrl);
          if (dataApiUrl) {
            const balanceSheetResponse = await fetch(`${dataApiUrl}/get-address-balances`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: walletAddress, include_outpoints: false }),
            });

            if (balanceSheetResponse.ok) {
              const balanceSheet = await balanceSheetResponse.json();
              console.log('[useSellableCurrencies] ========================================');
              console.log('[useSellableCurrencies] BALANCE SHEET FROM INDEXER API');
              console.log('[useSellableCurrencies] ========================================');
              console.log('[useSellableCurrencies] Full response:', JSON.stringify(balanceSheet, null, 2));
              console.log('[useSellableCurrencies] Address:', walletAddress);
              console.log('[useSellableCurrencies] Network:', network);
              console.log('[useSellableCurrencies] frBTC Alkane ID (32:0):', config.FRBTC_ALKANE_ID);

              if (balanceSheet?.balances) {
                console.log('[useSellableCurrencies] All balances from indexer:');
                Object.entries(balanceSheet.balances).forEach(([alkaneId, balance]) => {
                  const isFrbtc = alkaneId === config.FRBTC_ALKANE_ID;
                  console.log(`[useSellableCurrencies]   ${isFrbtc ? '>>> ' : ''}${alkaneId}: ${balance}${isFrbtc ? ' (frBTC) <<<' : ''}`);
                });
              } else {
                console.log('[useSellableCurrencies] ⚠ No balances in response');
              }
              console.log('[useSellableCurrencies] ========================================');

              // Process balance sheet entries (e.g., {"32:0": "9990"} for frBTC)
              if (balanceSheet?.balances && typeof balanceSheet.balances === 'object') {
                for (const [alkaneId, balance] of Object.entries(balanceSheet.balances)) {
                  console.log(`[useSellableCurrencies] Processing alkane: ${alkaneId}, balance: ${balance}`);

                  if (!alkaneId || seenIds.has(alkaneId)) {
                    console.log(`[useSellableCurrencies]   Skipped: ${!alkaneId ? 'no ID' : 'already seen'}`);
                    continue;
                  }
                  seenIds.add(alkaneId);

                  // Determine name based on alkane ID
                  let name = alkaneId;
                  let symbol = alkaneId.split(':')[1] || 'ALK';
                  if (alkaneId === config.FRBTC_ALKANE_ID) {
                    name = 'frBTC';
                    symbol = 'frBTC';
                  }

                  // Check if token is in the allowed pools list (if filter provided)
                  if (tokensWithPools && !tokensWithPools.some((p) => p.id === alkaneId)) {
                    console.log(`[useSellableCurrencies]   Filtered out: ${alkaneId} not in tokensWithPools`);
                    continue;
                  }

                  allAlkanes.push({
                    id: alkaneId,
                    address: walletAddress,
                    name,
                    symbol,
                    balance: String(balance),
                    priceInfo: {
                      price: 0,
                      idClubMarketplace: false,
                    },
                  });
                }
              }
            }
          }
        } catch (balanceSheetErr) {
          console.error('[useSellableCurrencies] Balance sheet fetch error:', balanceSheetErr);
        }

        // Process alkane tokens from enriched balances (asset UTXOs contain runes/alkanes)
        if (enriched && enriched.assets.length > 0) {
          for (const asset of enriched.assets) {
            // Skip LP tokens and invalid entries
            const name = asset.name || asset.token_name || '';
            if (!name || name === '' || name.includes('LP (OYL)') || name === '{REVERT}' || name.endsWith(' LP')) {
              continue;
            }

            const alkaneId = asset.alkane_id || asset.alkaneId;
            if (!alkaneId) continue;

            const id = typeof alkaneId === 'string'
              ? alkaneId
              : `${alkaneId.block}:${alkaneId.tx}`;

            // Skip if already added from balance sheet
            if (seenIds.has(id)) continue;
            seenIds.add(id);

            // Check if token is in the allowed pools list
            if (tokensWithPools && !tokensWithPools.some((p) => p.id === id)) {
              continue;
            }

            allAlkanes.push({
              id,
              address: walletAddress,
              name: name.replace('SUBFROST BTC', 'frBTC'),
              symbol: asset.symbol || '',
              balance: asset.balance || asset.value || '0',
              priceInfo: {
                price: asset.busdPoolPriceInUsd || asset.priceUsd || 0,
                idClubMarketplace: asset.idClubMarketplace || false,
              },
            });
          }
        }

        // Sort by balance descending, then by name
        allAlkanes.sort((a, b) => {
          const balanceA = typeof a.balance === 'string' ? parseFloat(a.balance) : (a.balance ?? 0);
          const balanceB = typeof b.balance === 'string' ? parseFloat(b.balance) : (b.balance ?? 0);
          if (balanceA === balanceB) return (a.name || '').localeCompare(b.name || '');
          return balanceA > balanceB ? -1 : 1;
        });

        return allAlkanes;
      } catch (error) {
        console.error('[useSellableCurrencies] Error:', error);
        return [];
      }
    },
  });
};
