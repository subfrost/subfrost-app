/**
 * useEnrichedWalletData - Fetches enriched wallet data including UTXOs and alkane balances
 *
 * Flow:
 * 1. provider.getEnrichedBalances(address) - Calls balances.lua for UTXOs + inscriptions + runes
 * 2. provider.dataApi.getAlkanesByAddress(address) - SDK dataApi for alkane token balances
 *
 * JOURNAL ENTRY (2026-02-03):
 * Migrated from deprecated fetchAlkaneBalances to SDK's dataApi.getAlkanesByAddress.
 *
 * JOURNAL ENTRY (2026-02-02):
 * Converted from useEffect+useState to useQuery. The query is invalidated by the
 * central HeightPoller when block height changes.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { enrichedWalletQueryOptions } from '@/queries/account';

export interface AlkaneAsset {
  alkaneId: string;
  name: string;
  symbol: string;
  balance: string;
  decimals: number;
  logo?: string;
  priceUsd?: number;
  priceInSatoshi?: number;
}

export interface EnrichedUTXO {
  txid: string;
  vout: number;
  value: number;
  address: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  alkanes?: Record<string, { value: string; name: string; symbol: string; decimals?: number }>;
  inscriptions?: Array<{ id: string; number: number }>;
  runes?: Record<string, { amount: string; symbol: string; divisibility: number }>;
}

export interface WalletBalances {
  bitcoin: {
    p2wpkh: number;
    p2tr: number;
    total: number;
    spendable: number;
    withAssets: number;
    pendingP2wpkh: number;
    pendingP2tr: number;
    pendingTotal: number;
  };
  pendingTxCount: {
    p2wpkh: number;
    p2tr: number;
  };
  alkanes: AlkaneAsset[];
  runes: Array<{ id: string; symbol: string; balance: string; divisibility: number }>;
}

export interface EnrichedWalletData {
  balances: WalletBalances;
  utxos: {
    p2wpkh: EnrichedUTXO[];
    p2tr: EnrichedUTXO[];
    all: EnrichedUTXO[];
  };
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EMPTY_BALANCES: WalletBalances = {
  bitcoin: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0, withAssets: 0, pendingP2wpkh: 0, pendingP2tr: 0, pendingTotal: 0 },
  pendingTxCount: { p2wpkh: 0, p2tr: 0 },
  alkanes: [],
  runes: [],
};

const EMPTY_UTXOS = { p2wpkh: [] as EnrichedUTXO[], p2tr: [] as EnrichedUTXO[], all: [] as EnrichedUTXO[] };

export function useEnrichedWalletData(): EnrichedWalletData {
  const { account, isConnected, network } = useWallet() as any;
  const { provider, isInitialized } = useAlkanesSDK();
  const queryClient = useQueryClient();

  const opts = enrichedWalletQueryOptions({
    provider,
    isInitialized,
    account,
    isConnected,
    network: network || 'mainnet',
  });

  const { data, isLoading, error, refetch } = useQuery(opts);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    balances: data?.balances ?? EMPTY_BALANCES,
    utxos: data?.utxos ?? EMPTY_UTXOS,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Failed to fetch wallet data') : null,
    refresh,
  };
}
