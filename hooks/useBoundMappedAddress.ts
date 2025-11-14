import { useQuery } from '@tanstack/react-query';
import { getConfig } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';

/**
 * Fetches the Ethereum deposit address bound to a Bitcoin address
 * This is used for the USDT/USDC -> bUSD bridge flow
 */
export function useBoundMappedAddress(btcAddress?: string) {
  const { network } = useWallet();
  const config = getConfig(network);
  const boundApiUrl = config.BOUND_API_URL;

  return useQuery({
    queryKey: ['bound-mapped-address', btcAddress, network],
    queryFn: async () => {
      if (!btcAddress || !boundApiUrl) {
        throw new Error('Missing BTC address or Bound API URL');
      }

      const response = await fetch(`${boundApiUrl}/bound-addresses/${btcAddress}`);
      
      if (!response.ok) {
        // If 404, address not bound yet - create binding
        if (response.status === 404) {
          const createResponse = await fetch(`${boundApiUrl}/bound-addresses`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              btcAddress,
            }),
          });
          
          if (!createResponse.ok) {
            throw new Error(`Failed to create bound address: ${createResponse.statusText}`);
          }
          
          const createData = await createResponse.json();
          return createData.evmAddress || createData.ethereumAddress;
        }
        
        throw new Error(`Failed to fetch bound address: ${response.statusText}`);
      }

      const data = await response.json();
      return data.evmAddress || data.ethereumAddress || data.address;
    },
    enabled: !!btcAddress && !!boundApiUrl,
    staleTime: 1000 * 60 * 60, // 1 hour - these addresses don't change
    retry: 1,
  });
}
