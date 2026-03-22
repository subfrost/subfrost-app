/**
 * useEnrichedWalletData - Fetches enriched wallet data including UTXOs and alkane balances
 *
 * Flow:
 * 1. provider.getEnrichedBalances(address) - Calls balances.lua for UTXOs + inscriptions + runes
 * 2. /api/alkane-balances - REST API for alkane token balances with metadata
 *
 * JOURNAL ENTRY (2026-02-03):
 * Migrated from deprecated fetchAlkaneBalances to SDK's dataApi.getAlkanesByAddress.
 *
 * JOURNAL ENTRY (2026-02-02):
 * Converted from useEffect+useState to useQuery. The query is invalidated by the
 * central HeightPoller when block height changes.
 *
 * JOURNAL ENTRY (2026-03-22):
 * Fixed intermittent balance loading — protorunes would sometimes not appear on
 * wallet dashboard, requiring refresh or disconnect/reconnect. Root causes:
 *   - No retry logic: transient API failures returned empty data permanently
 *   - No explicit refetch on wallet connection state change
 *   - No staleTime: unnecessary refetches racing with each other
 *   - 15s auto-refresh band-aid in AlkanesBalancesCard was insufficient
 * Fix: Added retry(3), staleTime(30s), refetchOnMount('always') to query options,
 * plus an effect here that triggers refetch when isConnected transitions to true
 * with a ready provider.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { enrichedWalletQueryOptions } from '@/queries/account';
import { queryKeys } from '@/queries/keys';

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
    pendingOutgoingP2wpkh: number;
    pendingOutgoingP2tr: number;
    pendingOutgoingTotal: number;
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
  bitcoin: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0, withAssets: 0, pendingP2wpkh: 0, pendingP2tr: 0, pendingTotal: 0, pendingOutgoingP2wpkh: 0, pendingOutgoingP2tr: 0, pendingOutgoingTotal: 0 },
  pendingTxCount: { p2wpkh: 0, p2tr: 0 },
  alkanes: [],
  runes: [],
};

const EMPTY_UTXOS = { p2wpkh: [] as EnrichedUTXO[], p2tr: [] as EnrichedUTXO[], all: [] as EnrichedUTXO[] };

export function useEnrichedWalletData(): EnrichedWalletData {
  const { account, isConnected, network } = useWallet() as any;
  const { provider, isInitialized } = useAlkanesSDK();
  const queryClient = useQueryClient();
  const prevConnectedRef = useRef(false);

  const opts = enrichedWalletQueryOptions({
    provider,
    isInitialized,
    account,
    isConnected,
    network: network || 'mainnet',
  });

  const { data, isLoading, error, refetch } = useQuery(opts);

  // Trigger an immediate refetch when the wallet transitions to connected state
  // AND the SDK provider is ready. This covers:
  //   - Initial page load with cached wallet (SDK may init after wallet restores)
  //   - Fresh wallet connection (isConnected flips from false to true)
  //   - Disconnect + reconnect cycle
  useEffect(() => {
    const isReady = isConnected && isInitialized && !!provider && !!account;
    const wasDisconnected = !prevConnectedRef.current;

    if (isReady && wasDisconnected) {
      console.log('[useEnrichedWalletData] Wallet connected + SDK ready — triggering balance fetch');
      // Small delay to let React settle state updates from the connection flow
      const timer = setTimeout(() => {
        // Invalidate to clear any stale/empty cached data, then refetch
        const addresses: string[] = [];
        if (account?.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
        if (account?.taproot?.address) addresses.push(account.taproot.address);
        const addressKey = addresses.sort().join(',');
        if (addressKey) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.account.enrichedWallet(network || 'mainnet', addressKey),
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    prevConnectedRef.current = isReady;
  }, [isConnected, isInitialized, provider, account, network, queryClient]);

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
