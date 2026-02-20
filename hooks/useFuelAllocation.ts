import { useState, useEffect } from 'react';
import { useWallet } from '@/context/WalletContext';

export interface FuelAllocation {
  isEligible: boolean;
  amount: number;
}

/**
 * Checks whether the connected wallet's taproot or payment address
 * has a FUEL allocation via the /api/fuel endpoint.
 */
export function useFuelAllocation(): FuelAllocation {
  const { address, paymentAddress, isConnected } = useWallet();
  const [allocation, setAllocation] = useState<FuelAllocation>({ isEligible: false, amount: 0 });

  useEffect(() => {
    if (!isConnected) {
      setAllocation({ isEligible: false, amount: 0 });
      return;
    }

    let cancelled = false;

    async function check(addr: string): Promise<number> {
      try {
        const res = await fetch(`/api/fuel?address=${encodeURIComponent(addr)}`);
        if (!res.ok) return 0;
        const data = await res.json();
        return data.amount ?? 0;
      } catch {
        return 0;
      }
    }

    (async () => {
      // Check taproot first, then payment address
      if (address) {
        const amount = await check(address);
        if (cancelled) return;
        if (amount > 0) {
          setAllocation({ isEligible: true, amount });
          return;
        }
      }

      if (paymentAddress && paymentAddress !== address) {
        const amount = await check(paymentAddress);
        if (cancelled) return;
        if (amount > 0) {
          setAllocation({ isEligible: true, amount });
          return;
        }
      }

      if (!cancelled) {
        setAllocation({ isEligible: false, amount: 0 });
      }
    })();

    return () => { cancelled = true; };
  }, [address, paymentAddress, isConnected]);

  return allocation;
}
