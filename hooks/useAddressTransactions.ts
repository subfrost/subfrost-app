import { useQuery } from '@tanstack/react-query';
import type { Network } from '@oyl/sdk';
import type { Transaction } from '@/app/activity/types';

type MempoolTransaction = {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout: {
      scriptpubkey: string;
      scriptpubkey_asm: string;
      scriptpubkey_type: string;
      scriptpubkey_address: string;
      value: number;
    };
    scriptsig: string;
    scriptsig_asm: string;
    witness?: string[];
    is_coinbase: boolean;
    sequence: number;
  }>;
  vout: Array<{
    scriptpubkey: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    scriptpubkey_address?: string;
    value: number;
  }>;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
};

/**
 * Fetch address transactions from mempool.space API
 */
async function fetchAddressTransactions(
  address: string,
  network: Network
): Promise<MempoolTransaction[]> {
  const baseUrl = network === 'testnet' 
    ? 'https://mempool.space/testnet/api'
    : network === 'signet'
    ? 'https://mempool.space/signet/api'
    : 'https://mempool.space/api';

  try {
    const response = await fetch(`${baseUrl}/address/${address}/txs`);
    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching address transactions:', error);
    return [];
  }
}

/**
 * Parse mempool transactions into our Transaction type
 * This is a simplified parser - in production you'd need more sophisticated
 * logic to identify transaction types (Swap/Wrap/Unwrap) from OP_RETURN data
 */
function parseTransactions(
  mempoolTxs: MempoolTransaction[],
  userAddress: string,
  network: Network
): Transaction[] {
  return mempoolTxs.map((tx) => {
    // Determine if user is sender or receiver
    const isSender = tx.vin.some(
      (input) => input.prevout.scriptpubkey_address === userAddress
    );
    const isReceiver = tx.vout.some(
      (output) => output.scriptpubkey_address === userAddress
    );

    // Calculate amounts (simplified - would need alkane parsing in production)
    const amountFrom = isSender
      ? tx.vin
          .filter((input) => input.prevout.scriptpubkey_address === userAddress)
          .reduce((sum, input) => sum + input.prevout.value, 0) / 1e8
      : 0;

    const amountTo = isReceiver
      ? tx.vout
          .filter((output) => output.scriptpubkey_address === userAddress)
          .reduce((sum, output) => sum + output.value, 0) / 1e8
      : 0;

    // Default to Swap type - in production, parse OP_RETURN for alkane opcodes
    // to determine if it's Swap/Wrap/Unwrap/Deposit/Withdraw
    const type: Transaction['type'] = 'Swap';

    // Status
    const status: Transaction['status'] = tx.status.confirmed
      ? 'confirmed'
      : 'pending';

    return {
      id: tx.txid,
      type,
      txHash: tx.txid,
      fromToken: {
        id: 'btc', // Would parse from alkane data in production
        symbol: 'BTC',
        name: 'Bitcoin',
      },
      toToken: {
        id: 'btc', // Would parse from alkane data in production
        symbol: 'BTC',
        name: 'Bitcoin',
      },
      amountFrom: amountFrom.toFixed(8),
      amountTo: amountTo.toFixed(8),
      timestamp: tx.status.block_time
        ? tx.status.block_time * 1000
        : Date.now(),
      status,
    };
  });
}

/**
 * Hook to fetch and parse user's address transactions
 */
export function useAddressTransactions(address?: string, network: Network = 'mainnet') {
  return useQuery({
    queryKey: ['address-transactions', address, network],
    queryFn: async () => {
      if (!address) return [];
      
      const mempoolTxs = await fetchAddressTransactions(address, network);
      return parseTransactions(mempoolTxs, address, network);
    },
    enabled: Boolean(address),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute to catch new transactions
  });
}
