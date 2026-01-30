import { useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import FUEL_ALLOCATIONS from '@/data/fuelAllocations';

export interface FuelAllocation {
  isEligible: boolean;
  amount: number;
}

/**
 * Checks whether the connected wallet's taproot or payment address
 * appears in the FUEL allocation table and returns the allocation.
 */
export function useFuelAllocation(): FuelAllocation {
  const { address, paymentAddress, isConnected } = useWallet();

  return useMemo(() => {
    if (!isConnected) {
      return { isEligible: false, amount: 0 };
    }

    // Check taproot address first, then payment (segwit) address
    const taprootAlloc = address ? FUEL_ALLOCATIONS[address] : undefined;
    if (taprootAlloc !== undefined) {
      return { isEligible: true, amount: taprootAlloc };
    }

    const paymentAlloc = paymentAddress ? FUEL_ALLOCATIONS[paymentAddress] : undefined;
    if (paymentAlloc !== undefined) {
      return { isEligible: true, amount: paymentAlloc };
    }

    return { isEligible: false, amount: 0 };
  }, [address, paymentAddress, isConnected]);
}
