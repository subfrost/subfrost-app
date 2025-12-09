import { useQuery } from '@tanstack/react-query';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';
import { getPendingWrapsForAlkane, removePendingWrap } from '@/utils/pendingWraps';

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
    staleTime: 1000 * 60 * 2,
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
              console.log('[useSellableCurrencies] Balance sheet:', balanceSheet);

              // Process balance sheet entries (e.g., {"32:0": "9990"} for frBTC)
              if (balanceSheet?.balances && typeof balanceSheet.balances === 'object') {
                for (const [alkaneId, balance] of Object.entries(balanceSheet.balances)) {
                  if (!alkaneId || seenIds.has(alkaneId)) continue;
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
                    continue;
                  }

                  // Add pending wraps to the balance (for frBTC or other wrapped tokens)
                  // Pending wraps are transactions that completed but haven't been indexed yet
                  let finalBalance = String(balance);
                  const pendingWraps = getPendingWrapsForAlkane(alkaneId, network);

                  if (pendingWraps.length > 0) {
                    // Sum up pending wrap amounts
                    const pendingTotal = pendingWraps.reduce((sum, wrap) => {
                      return sum + BigInt(wrap.frbtcAmount);
                    }, BigInt(0));

                    const indexedBalance = BigInt(String(balance));

                    // Check if any pending wraps appear to be indexed already
                    // This can happen if the indexer caught up between wraps
                    // We'll detect this by checking if indexed balance >= any single pending wrap amount
                    // and remove those wraps from the pending list
                    for (const wrap of pendingWraps) {
                      const wrapAmount = BigInt(wrap.frbtcAmount);
                      // If indexed balance is >= this wrap amount, it might be indexed
                      // To be safe, we check if the wrap is older than 2 minutes
                      const wrapAge = Date.now() - wrap.timestamp;
                      if (indexedBalance >= wrapAmount && wrapAge > 120_000) {
                        console.log(`[useSellableCurrencies] Removing indexed wrap:`, wrap.txid);
                        removePendingWrap(wrap.txid);
                      }
                    }

                    // Recalculate pending wraps after cleanup
                    const updatedPendingWraps = getPendingWrapsForAlkane(alkaneId, network);
                    const updatedPendingTotal = updatedPendingWraps.reduce((sum, wrap) => {
                      return sum + BigInt(wrap.frbtcAmount);
                    }, BigInt(0));

                    // Add pending to indexed balance
                    const totalBalance = indexedBalance + updatedPendingTotal;
                    finalBalance = totalBalance.toString();

                    console.log(`[useSellableCurrencies] ${name} balance:`, {
                      indexed: balance,
                      pending: updatedPendingTotal.toString(),
                      total: finalBalance,
                      pendingWraps: updatedPendingWraps.length,
                    });
                  }

                  allAlkanes.push({
                    id: alkaneId,
                    address: walletAddress,
                    name,
                    symbol,
                    balance: finalBalance,
                    priceInfo: {
                      price: 0,
                      idClubMarketplace: false,
                    },
                  });
                }
              }

              // Also check for pending wraps that haven't been indexed yet (no balance sheet entry)
              // This handles the case where the first wrap hasn't been indexed
              const pendingFrbtcWraps = getPendingWrapsForAlkane(config.FRBTC_ALKANE_ID, network);
              if (pendingFrbtcWraps.length > 0 && !seenIds.has(config.FRBTC_ALKANE_ID)) {
                // frBTC exists as pending wraps but not in balance sheet yet
                const pendingTotal = pendingFrbtcWraps.reduce((sum, wrap) => {
                  return sum + BigInt(wrap.frbtcAmount);
                }, BigInt(0));

                console.log('[useSellableCurrencies] frBTC has pending wraps but no indexed balance:', {
                  pending: pendingTotal.toString(),
                  pendingWraps: pendingFrbtcWraps.length,
                });

                // Check if frBTC is in the allowed pools list (if filter provided)
                if (!tokensWithPools || tokensWithPools.some((p) => p.id === config.FRBTC_ALKANE_ID)) {
                  seenIds.add(config.FRBTC_ALKANE_ID);

                  allAlkanes.push({
                    id: config.FRBTC_ALKANE_ID,
                    address: walletAddress,
                    name: 'frBTC',
                    symbol: 'frBTC',
                    balance: pendingTotal.toString(),
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

          // Even if balance sheet fetch fails, check for pending wraps
          // This ensures we show pending wraps even when the API is down
          const pendingFrbtcWraps = getPendingWrapsForAlkane(config.FRBTC_ALKANE_ID, network);
          if (pendingFrbtcWraps.length > 0 && !seenIds.has(config.FRBTC_ALKANE_ID)) {
            const pendingTotal = pendingFrbtcWraps.reduce((sum, wrap) => {
              return sum + BigInt(wrap.frbtcAmount);
            }, BigInt(0));

            console.log('[useSellableCurrencies] Showing pending wraps despite balance sheet error:', {
              pending: pendingTotal.toString(),
              pendingWraps: pendingFrbtcWraps.length,
            });

            // Check if frBTC is in the allowed pools list (if filter provided)
            if (!tokensWithPools || tokensWithPools.some((p) => p.id === config.FRBTC_ALKANE_ID)) {
              seenIds.add(config.FRBTC_ALKANE_ID);

              allAlkanes.push({
                id: config.FRBTC_ALKANE_ID,
                address: walletAddress,
                name: 'frBTC',
                symbol: 'frBTC',
                balance: pendingTotal.toString(),
                priceInfo: {
                  price: 0,
                  idClubMarketplace: false,
                },
              });
            }
          }
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
