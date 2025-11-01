'use client';

import { useMemo } from 'react';
import { useSellableCurrencies } from './useSellableCurrencies';
import { useWallet } from '../contexts/WalletContext';

export function useAlkaneRawBalance(alkaneId?: string) {
  const { address } = useWallet();
  const { data = [] } = useSellableCurrencies(address);

  return useMemo(() => {
    if (!alkaneId) return '0';
    const currency = (data as any[]).find((c) => c.id === alkaneId);
    return currency?.balance ?? '0';
  }, [data, alkaneId]);
}

export function useAlkaneBalance(alkaneId?: string, decimals = 8) {
  const raw = useAlkaneRawBalance(alkaneId);
  return useMemo(() => {
    const n = Number(raw || '0');
    return n / 10 ** decimals;
  }, [raw, decimals]);
}

export function useFrBtcBalance() {
  return useAlkaneBalance('32:0', 8);
}


