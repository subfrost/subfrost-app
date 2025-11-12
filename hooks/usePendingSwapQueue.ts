import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import { useBridgeDepositHistory } from '@/hooks/useBridgeDepositHistory';

interface PendingSwap {
  id: string;
  createdAt: number;
  fromToken: string;
  toToken: string;
  expectedBusdAmount: string;
  targetToken: string;
  targetSymbol: string;
  bridgeEthTxHash?: string;
  status: 'waiting-for-busd' | 'ready-to-swap' | 'swapping' | 'completed' | 'failed';
  maxSlippage: number;
  feeRate: number;
}

const PENDING_SWAPS_KEY = 'subfrost_pending_swaps';

/**
 * Hook to manage pending swaps that need to execute after bridge completes
 */
export function usePendingSwapQueue() {
  const { address, network } = useWallet();
  const queryClient = useQueryClient();
  const config = getConfig(network);
  const { BUSD_ALKANE_ID } = config;
  const { data: bridgeHistory } = useBridgeDepositHistory();

  // Load pending swaps from localStorage
  const { data: pendingSwaps = [] } = useQuery<PendingSwap[]>({
    queryKey: ['pending-swaps', address],
    queryFn: () => {
      if (!address) return [];
      const stored = localStorage.getItem(`${PENDING_SWAPS_KEY}_${address}`);
      if (!stored) return [];
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    },
    enabled: !!address,
    refetchInterval: 5000, // Check every 5 seconds
  });

  // Save pending swaps to localStorage
  const savePendingSwaps = useCallback((swaps: PendingSwap[]) => {
    if (!address) return;
    localStorage.setItem(`${PENDING_SWAPS_KEY}_${address}`, JSON.stringify(swaps));
    queryClient.setQueryData(['pending-swaps', address], swaps);
  }, [address, queryClient]);

  // Add a new pending swap
  const addPendingSwap = useCallback((swap: Omit<PendingSwap, 'id' | 'createdAt' | 'status'>) => {
    const newSwap: PendingSwap = {
      ...swap,
      id: `pending_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      status: 'waiting-for-busd',
    };
    const updated = [...pendingSwaps, newSwap];
    savePendingSwaps(updated);
    return newSwap.id;
  }, [pendingSwaps, savePendingSwaps]);

  // Remove a pending swap
  const removePendingSwap = useCallback((id: string) => {
    const updated = pendingSwaps.filter(s => s.id !== id);
    savePendingSwaps(updated);
  }, [pendingSwaps, savePendingSwaps]);

  // Update swap status
  const updateSwapStatus = useCallback((id: string, status: PendingSwap['status']) => {
    const updated = pendingSwaps.map(s => 
      s.id === id ? { ...s, status } : s
    );
    savePendingSwaps(updated);
  }, [pendingSwaps, savePendingSwaps]);

  // Check for bUSD arrivals and mark swaps as ready
  useEffect(() => {
    if (!address || !BUSD_ALKANE_ID || !bridgeHistory) return;

    pendingSwaps.forEach(async (swap) => {
      if (swap.status !== 'waiting-for-busd') return;

      // Check if the bridge deposit has completed
      const matchingDeposit = bridgeHistory.completed.find(
        (deposit: any) => deposit.txHash === swap.bridgeEthTxHash
      );

      // If deposit completed, mark swap as ready
      if (matchingDeposit) {
        updateSwapStatus(swap.id, 'ready-to-swap');
        
        // Notify user
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Swap Ready!', {
            body: `Your ${swap.targetSymbol} swap is ready to execute. bUSD has arrived!`,
            icon: '/brand/snowflake-mark.svg',
          });
        }
      }
    });
  }, [pendingSwaps, address, BUSD_ALKANE_ID, bridgeHistory, updateSwapStatus]);

  // Get swaps ready to execute
  const readySwaps = pendingSwaps.filter(s => s.status === 'ready-to-swap');

  // Get swaps still waiting
  const waitingSwaps = pendingSwaps.filter(s => s.status === 'waiting-for-busd');

  return {
    pendingSwaps,
    readySwaps,
    waitingSwaps,
    addPendingSwap,
    removePendingSwap,
    updateSwapStatus,
  };
}
