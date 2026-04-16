/**
 * useEnrichedWalletData - Fetches enriched wallet data including UTXOs and alkane balances
 *
 * Flow:
 * 1. enrichedWalletQueryOptions — BTC UTXOs + runes via provider.getEnrichedBalances (Lua)
 * 2. alkaneBalanceQueryOptions — Alkane balances via provider.alkanesByAddress (SDK WASM)
 *
 * These are separate React Query instances so alkane failures never block BTC display.
 * Each has its own retry, staleTime, and error lifecycle.
 *
 * JOURNAL ENTRY (2026-02-02):
 * Converted from useEffect+useState to useQuery. The query is invalidated by the
 * central HeightPoller when block height changes.
 *
 * JOURNAL ENTRY (2026-02-03):
 * Migrated from deprecated fetchAlkaneBalances to SDK's dataApi.getAlkanesByAddress.
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
 *
 * JOURNAL ENTRY (2026-03-22):
 * Decoupled alkane balance fetching into its own query (alkaneBalanceQueryOptions)
 * using the SDK's provider.dataApiGetAlkanesByAddress() — Espo-backed data API
 * that returns enriched metadata (name, symbol, balance, price, tokenImage).
 * Removes the /api/alkane-balances server-side proxy dependency and the
 * _alkanesFetchFailed monkey-patch retry logic.
 * Each query now has independent TanStack Query lifecycle (retry, error, staleTime).
 *
 * Note: Initially tried provider.alkanesByAddress() (raw WASM protorunesbyaddress)
 * but that returns only a flat alkaneId→balance Map without name/symbol metadata.
 * The data API returns full token info including names from on-chain contract metadata.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { enrichedWalletQueryOptions, alkaneBalanceQueryOptions } from '@/queries/account';
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
  /** True until BTC UTXO data resolves — does not wait on alkane balances. */
  isLoading: boolean;
  /** True while alkane balance data is still loading. */
  isAlkaneLoading: boolean;
  /** True until both BTC and alkane data have resolved. */
  isFullyLoaded: boolean;
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

  const sharedDeps = {
    provider,
    isInitialized,
    account,
    isConnected,
    network: network || 'mainnet',
  };

  // Query 1: BTC UTXOs + runes (via Lua script)
  const btcQuery = useQuery(enrichedWalletQueryOptions(sharedDeps));

  // Query 2: Alkane balances (via SDK WASM — alkanes_protorunesbyaddress RPC)
  const alkaneQuery = useQuery(alkaneBalanceQueryOptions(sharedDeps));

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
      const timer = setTimeout(() => {
        const addresses: string[] = [];
        if (account?.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
        if (account?.taproot?.address) addresses.push(account.taproot.address);
        const addressKey = addresses.sort().join(',');
        if (addressKey) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.account.enrichedWallet(network || 'mainnet', addressKey),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.account.alkaneBalances(network || 'mainnet', addressKey),
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }

    prevConnectedRef.current = isReady;
  }, [isConnected, isInitialized, provider, account, network, queryClient]);

  const refresh = useCallback(async () => {
    await Promise.all([btcQuery.refetch(), alkaneQuery.refetch()]);
  }, [btcQuery.refetch, alkaneQuery.refetch]);

  // Merge BTC data + alkane data into the unified WalletBalances shape
  const balances: WalletBalances = btcQuery.data
    ? {
        ...btcQuery.data.balances,
        alkanes: alkaneQuery.data ?? [],
      }
    : EMPTY_BALANCES;

  return {
    balances,
    utxos: btcQuery.data?.utxos ?? EMPTY_UTXOS,
    // BTC display unblocked as soon as btcQuery resolves — alkanes load independently.
    isLoading: btcQuery.isLoading,
    isAlkaneLoading: alkaneQuery.isLoading,
    isFullyLoaded: !btcQuery.isLoading && !alkaneQuery.isLoading,
    error: btcQuery.error
      ? (btcQuery.error instanceof Error ? btcQuery.error.message : 'Failed to fetch wallet data')
      : alkaneQuery.error
        ? (alkaneQuery.error instanceof Error ? alkaneQuery.error.message : 'Failed to fetch alkane balances')
        : null,
    refresh,
  };
}
