import { useQuery } from '@tanstack/react-query';
import { getConfig } from '@/utils/getConfig';
import { useWallet } from '@/context/WalletContext';

interface BridgeDepositTransaction {
  id: string;
  status: 'pendingAlkane' | 'processingAlkane' | 'broadcastedAlkane' | 'completedAlkane' | 'failedAlkane' | 'rejectedAlkane' | 'claimedAlkane';
  amount: string;
  from_address: string;
  tx_id: string; // Ethereum tx hash
  destination_tx_id?: string; // Bitcoin tx hash
  source_token_address?: string;
  destination_token_address?: string;
  created_at?: string;
}

/**
 * Fetches bridge deposit history from Bound API
 * Returns incoming and completed deposits
 */
export function useBridgeDepositHistory(btcAddress?: string) {
  const { network } = useWallet();
  const config = getConfig(network);
  const boundApiUrl = config.BOUND_API_URL;

  return useQuery({
    queryKey: ['bridge-deposit-history', btcAddress, network],
    queryFn: async () => {
      if (!btcAddress || !boundApiUrl) {
        return { incoming: [], completed: [] };
      }

      try {
        const response = await fetch(`${boundApiUrl}/transactions/${btcAddress}?limit=20&offset=0`);
        
        if (!response.ok) {
          if (response.status === 404) {
            // No transactions yet
            return { incoming: [], completed: [] };
          }
          throw new Error(`Failed to fetch deposit history: ${response.statusText}`);
        }

        const data = await response.json();
        const transactions = Array.isArray(data) ? data : data.transactions || [];

        // Filter for deposits (Ethereum -> Bitcoin direction)
        const deposits = transactions.filter((tx: any) => 
          tx.from_address && tx.from_address.startsWith('0x') // Ethereum address
        );

        // Classify transactions
        const incomingStatuses = ['pendingAlkane', 'processingAlkane', 'broadcastedAlkane'];
        const completedStatuses = ['completedAlkane', 'claimedAlkane'];

        const incoming = deposits
          .filter((tx: any) => incomingStatuses.includes(tx.status))
          .map(mapTransaction);

        const completed = deposits
          .filter((tx: any) => completedStatuses.includes(tx.status))
          .map(mapTransaction);

        return { incoming, completed };
      } catch (error) {
        console.error('Failed to fetch bridge deposit history:', error);
        return { incoming: [], completed: [] };
      }
    },
    enabled: !!btcAddress && !!boundApiUrl,
    refetchInterval: 10000, // Refetch every 10 seconds for incoming deposits
    staleTime: 5000, // Consider data stale after 5 seconds
  });
}

function mapTransaction(tx: any): BridgeDepositTransaction {
  // Determine token type from source address or amount
  // This is a heuristic - you may need to adjust based on actual API response
  const tokenType = tx.source_token_address?.toLowerCase().includes('usdt') ? 'USDT' : 'USDC';

  return {
    id: tx.id || tx.tx_id,
    status: tx.status,
    amount: tx.amount || '0',
    from_address: tx.from_address,
    tx_id: tx.tx_id,
    destination_tx_id: tx.destination_tx_id,
    source_token_address: tx.source_token_address,
    destination_token_address: tx.destination_token_address,
    created_at: tx.created_at,
  };
}
