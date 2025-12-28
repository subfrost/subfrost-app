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

/**
 * Fallback token metadata.
 * NOTE: 2:0 is ALWAYS DIESEL, 32:0 is ALWAYS frBTC on all networks.
 */
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
  '32:0': { symbol: 'frBTC', name: 'Fractional BTC', decimals: 8 },
};

/**
 * Fetches sellable currencies (alkane tokens) for a wallet address.
 *
 * IMPORTANT: This hook now uses the same data source as useEnrichedWalletData
 * (alkanesByAddress RPC) to ensure consistent balance display across the app.
 *
 * Previously used /get-address-balances API which returned different values.
 */
export const useSellableCurrencies = (
  walletAddress?: string,
  tokensWithPools?: { id: string; name?: string }[],
) => {
  const { provider, isInitialized } = useAlkanesSDK();
  const { network, account } = useWallet();
  const config = getConfig(network);

  return useQuery({
    queryKey: ['sellable-currencies', walletAddress, tokensWithPools, network],
    staleTime: 0, // Always refetch - no caching to ensure latest balance
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: network === 'subfrost-regtest' || network === 'regtest' ? 5000 : false,
    enabled: isInitialized && !!provider && !!walletAddress,
    queryFn: async (): Promise<CurrencyPriceInfoResponse[]> => {
      if (!walletAddress || !provider) return [];

      try {
        const allAlkanes: CurrencyPriceInfoResponse[] = [];
        const alkaneMap = new Map<string, CurrencyPriceInfoResponse>();

        // Get addresses to query (both nativeSegwit and taproot for complete balance)
        const addresses: string[] = [];
        if (account?.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
        if (account?.taproot?.address) addresses.push(account.taproot.address);
        // Also include the provided walletAddress if different
        if (walletAddress && !addresses.includes(walletAddress)) {
          addresses.push(walletAddress);
        }

        // Fetch alkane balances using alkanesByAddress RPC (same as useEnrichedWalletData)
        // This ensures consistent balance data across the app
        for (const address of addresses) {
          try {
            const rawResult = await provider.alkanesByAddress(address, 'latest', 1);
            const result = mapToObject(rawResult);

            if (!result) continue;

            // Parse outpoints array - this is the primary data structure from alkanes_protorunesbyaddress
            const outpoints = result.outpoints || [];
            for (const outpoint of outpoints) {
              const runes = outpoint.runes || [];
              for (const runeEntry of runes) {
                const rune = runeEntry.rune;
                if (!rune?.id) continue;

                // Build alkane ID from block:tx (hex values like "0x20")
                const blockStr = rune.id?.block || '0';
                const txStr = rune.id?.tx || '0';
                const block = typeof blockStr === 'string' && blockStr.startsWith('0x')
                  ? parseInt(blockStr)
                  : parseInt(String(blockStr), 16);
                const tx = typeof txStr === 'string' && txStr.startsWith('0x')
                  ? parseInt(txStr)
                  : parseInt(String(txStr), 16);

                if (isNaN(block) || isNaN(tx)) continue;

                const alkaneIdStr = `${block}:${tx}`;

                // Extract balance (can be string, number, or object)
                let balance = '0';
                if (typeof runeEntry.balance === 'string') {
                  balance = runeEntry.balance;
                } else if (typeof runeEntry.balance === 'number') {
                  balance = runeEntry.balance.toString();
                } else if (runeEntry.balance?.value) {
                  balance = String(runeEntry.balance.value);
                }

                // Get token info from known tokens or use defaults
                const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
                  symbol: rune.name || `${tx}`,
                  name: rune.name || `Token ${alkaneIdStr}`,
                  decimals: 8,
                };

                // Check if token is in the allowed pools list (if filter provided)
                if (tokensWithPools && !tokensWithPools.some((p) => p.id === alkaneIdStr)) {
                  continue;
                }

                // Aggregate balance if we've seen this token before
                if (!alkaneMap.has(alkaneIdStr)) {
                  alkaneMap.set(alkaneIdStr, {
                    id: alkaneIdStr,
                    address: walletAddress,
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    balance: balance,
                    priceInfo: {
                      price: 0,
                      idClubMarketplace: false,
                    },
                  });
                } else {
                  // Aggregate balance from multiple UTXOs/addresses
                  const existing = alkaneMap.get(alkaneIdStr)!;
                  try {
                    const currentBalance = BigInt(existing.balance || '0');
                    const additionalBalance = BigInt(balance);
                    existing.balance = (currentBalance + additionalBalance).toString();
                  } catch {
                    // If BigInt fails, use number addition
                    existing.balance = String(
                      Number(existing.balance || 0) + Number(balance)
                    );
                  }
                }
              }
            }

            // Also check balance_sheet format (fallback for some SDK versions)
            const balances = result.balances || [];
            for (const entry of balances) {
              const tokenBalances = entry.balance_sheet?.cached?.balances || {};
              for (const [alkaneIdStr, amount] of Object.entries(tokenBalances)) {
                const amountStr = String(amount);

                // Check if token is in the allowed pools list
                if (tokensWithPools && !tokensWithPools.some((p) => p.id === alkaneIdStr)) {
                  continue;
                }

                const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
                  symbol: alkaneIdStr.split(':')[1] || 'ALK',
                  name: `Token ${alkaneIdStr}`,
                  decimals: 8,
                };

                if (!alkaneMap.has(alkaneIdStr)) {
                  alkaneMap.set(alkaneIdStr, {
                    id: alkaneIdStr,
                    address: walletAddress,
                    name: tokenInfo.name,
                    symbol: tokenInfo.symbol,
                    balance: amountStr,
                    priceInfo: {
                      price: 0,
                      idClubMarketplace: false,
                    },
                  });
                } else {
                  const existing = alkaneMap.get(alkaneIdStr)!;
                  try {
                    const currentBalance = BigInt(existing.balance || '0');
                    const additionalBalance = BigInt(amountStr);
                    existing.balance = (currentBalance + additionalBalance).toString();
                  } catch {
                    existing.balance = String(
                      Number(existing.balance || 0) + Number(amountStr)
                    );
                  }
                }
              }
            }
          } catch (error) {
            console.error(`[useSellableCurrencies] Failed to fetch for ${address}:`, error);
          }
        }

        // NOTE: We skip alkanesReflect() for token metadata because the indexer can return
        // stale/incorrect data. Instead, we rely on KNOWN_TOKENS which has verified values.
        // Remember: 2:0 is ALWAYS DIESEL on all networks. bUSD is 2:56801 on mainnet only.

        // Convert map to array
        allAlkanes.push(...alkaneMap.values());

        // Log frBTC balance for debugging
        const frbtcBalance = alkaneMap.get(config.FRBTC_ALKANE_ID);
        if (frbtcBalance) {
          console.log('[useSellableCurrencies] frBTC balance:', frbtcBalance.balance);
        }

        // Sort by balance descending, then by name
        allAlkanes.sort((a, b) => {
          try {
            const balanceA = BigInt(a.balance || '0');
            const balanceB = BigInt(b.balance || '0');
            if (balanceA === balanceB) return (a.name || '').localeCompare(b.name || '');
            return balanceA > balanceB ? -1 : 1;
          } catch {
            const balanceA = Number(a.balance || 0);
            const balanceB = Number(b.balance || 0);
            if (balanceA === balanceB) return (a.name || '').localeCompare(b.name || '');
            return balanceA > balanceB ? -1 : 1;
          }
        });

        return allAlkanes;
      } catch (error) {
        console.error('[useSellableCurrencies] Error:', error);
        return [];
      }
    },
  });
};
