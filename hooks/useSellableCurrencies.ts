import { useQuery } from '@tanstack/react-query';
import type { CurrencyPriceInfoResponse } from '@/types/alkanes';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig, fetchAlkaneBalances } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';

/**
 * Fallback token metadata.
 * NOTE: 2:0 is ALWAYS DIESEL, 32:0 is ALWAYS frBTC on all networks.
 */
const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
  '32:0': { symbol: 'frBTC', name: 'frBTC', decimals: 8 },
};

/**
 * Fetches sellable currencies (alkane tokens) for a wallet address.
 *
 * Uses the OYL Alkanode REST API (/get-alkanes-by-address) for alkane balance queries.
 * This replaced the old alkanes_protorunesbyaddress RPC which returned 0x on regtest.
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

        console.log('[useSellableCurrencies] Fetching for addresses:', addresses);

        // Fetch alkane balances via OYL Alkanode REST API
        for (const address of addresses) {
          try {
            const alkaneBalances = await fetchAlkaneBalances(address, config.OYL_ALKANODE_URL);

            console.log('[useSellableCurrencies] OYL API result for', address, ':', alkaneBalances.length, 'tokens');

            for (const entry of alkaneBalances) {
              const alkaneIdStr = `${entry.alkaneId.block}:${entry.alkaneId.tx}`;
              const balance = String(entry.balance || '0');

              // Get token info from known tokens or use API response values
              const tokenInfo = KNOWN_TOKENS[alkaneIdStr] || {
                symbol: entry.symbol || `${entry.alkaneId.tx}`,
                name: entry.name || `Token ${alkaneIdStr}`,
                decimals: 8,
              };

              // Check if token is in the allowed pools list (if filter provided)
              if (tokensWithPools && !tokensWithPools.some((p) => p.id === alkaneIdStr)) {
                continue;
              }

              // Aggregate balance if we've seen this token before (multiple addresses)
              if (!alkaneMap.has(alkaneIdStr)) {
                alkaneMap.set(alkaneIdStr, {
                  id: alkaneIdStr,
                  address: walletAddress,
                  name: tokenInfo.name,
                  symbol: tokenInfo.symbol,
                  balance: balance,
                  priceInfo: {
                    price: Number(entry.priceUsd || 0),
                    idClubMarketplace: entry.idClubMarketplace || false,
                  },
                });
              } else {
                const existing = alkaneMap.get(alkaneIdStr)!;
                try {
                  const currentBalance = BigInt(existing.balance || '0');
                  const additionalBalance = BigInt(balance);
                  existing.balance = (currentBalance + additionalBalance).toString();
                } catch {
                  existing.balance = String(
                    Number(existing.balance || 0) + Number(balance)
                  );
                }
              }
            }
          } catch (error) {
            console.error(`[useSellableCurrencies] OYL API failed for ${address}:`, error);
          }
        }

        // Convert map to array
        allAlkanes.push(...alkaneMap.values());

        console.log('[useSellableCurrencies] Final alkaneMap size:', alkaneMap.size);
        console.log('[useSellableCurrencies] Alkanes found:', Array.from(alkaneMap.keys()));

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
