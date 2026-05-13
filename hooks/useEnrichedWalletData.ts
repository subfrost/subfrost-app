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

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { enrichedWalletQueryOptions, alkaneBalanceQueryOptions, btcBalanceFastQueryOptions } from '@/queries/account';
import type { BtcBalanceFast } from '@/queries/account';
import { queryKeys } from '@/queries/keys';
import { getAlkanesDataSource } from '@/lib/alkanes/dataSource';
import { useWalletUtxoCache } from '@/hooks/useWalletUtxoCache';

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
  addressAlkanes: AlkaneAsset[];
  spendableAlkanes: AlkaneAsset[];
  btcFast: BtcBalanceFast | null;
  utxos: {
    p2wpkh: EnrichedUTXO[];
    p2tr: EnrichedUTXO[];
    all: EnrichedUTXO[];
  };
  isLoading: boolean;
  isBtcLoading: boolean;
  isBtcFastLoading: boolean;
  isAlkanesLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshAlkanes: () => Promise<void>;
  refreshBtcFast: () => Promise<void>;
}

const EMPTY_BALANCES: WalletBalances = {
  bitcoin: { p2wpkh: 0, p2tr: 0, total: 0, spendable: 0, withAssets: 0, pendingP2wpkh: 0, pendingP2tr: 0, pendingTotal: 0, pendingOutgoingP2wpkh: 0, pendingOutgoingP2tr: 0, pendingOutgoingTotal: 0 },
  pendingTxCount: { p2wpkh: 0, p2tr: 0 },
  alkanes: [],
  runes: [],
};

const EMPTY_UTXOS = { p2wpkh: [] as EnrichedUTXO[], p2tr: [] as EnrichedUTXO[], all: [] as EnrichedUTXO[] };
const EMPTY_ALKANES: AlkaneAsset[] = [];

export function useEnrichedWalletData(): EnrichedWalletData {
  const { account, isConnected, network, walletType } = useWallet() as any;
  const { provider, isInitialized } = useAlkanesSDK();
  const queryClient = useQueryClient();
  const prevConnectedRef = useRef(false);
  const dataSource = getAlkanesDataSource(network || 'mainnet');
  const walletUtxoCache = useWalletUtxoCache();

  const sharedDeps = {
    provider,
    isInitialized,
    account,
    isConnected,
    network: network || 'mainnet',
  };

  // Query 0: Fast BTC balance. In ESPO mode this is derived from the same
  // populated spendable-outpoint cache used by swap/send builders, so the app
  // does not issue a separate esplora_address::utxo request for display.
  const btcFastQuery = useQuery(btcBalanceFastQueryOptions({
    account,
    isConnected,
    network: network || 'mainnet',
    walletType,
  }));

  // Query 1: BTC UTXOs + runes (via Lua script — slow, enriched details)
  const btcQuery = useQuery(enrichedWalletQueryOptions(sharedDeps));

  // Query 2: Alkane balances (via SDK WASM — alkanes_protorunesbyaddress RPC)
  const alkaneQuery = useQuery(alkaneBalanceQueryOptions(sharedDeps));
  const refetchBtcFast = btcFastQuery.refetch;
  const refetchBtc = btcQuery.refetch;
  const refetchAlkanes = alkaneQuery.refetch;

  // Trigger an immediate refetch when the wallet transitions to connected state
  // AND the SDK provider is ready. This covers:
  //   - Initial page load with cached wallet (SDK may init after wallet restores)
  //   - Fresh wallet connection (isConnected flips from false to true)
  //   - Disconnect + reconnect cycle
  useEffect(() => {
    const isReady = isConnected && isInitialized && !!provider && !!account;
    const wasDisconnected = !prevConnectedRef.current;

    // Update ref immediately to prevent multiple firings from rapid re-renders
    prevConnectedRef.current = isReady;

    if (isReady && wasDisconnected) {
      const timer = setTimeout(() => {
        const addresses: string[] = [];
        if (account?.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
        if (account?.taproot?.address) addresses.push(account.taproot.address);
        const addressKey = addresses.sort().join(',');
        if (addressKey) {
          queryClient.invalidateQueries({
            queryKey: ['btc-balance-fast'],
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.account.enrichedWallet(network || 'mainnet', addressKey),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.account.alkaneBalances(network || 'mainnet', addressKey),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.account.walletUtxoCache(network || 'mainnet', addressKey),
          });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isConnected, isInitialized, provider, account, network, queryClient]);

  const addressKey = useMemo(() => {
    const addresses: string[] = [];
    if (account?.nativeSegwit?.address) addresses.push(account.nativeSegwit.address);
    if (account?.taproot?.address) addresses.push(account.taproot.address);
    return addresses.sort().join(',');
  }, [account]);

  const btcFastFromWalletCache = useMemo<BtcBalanceFast | null>(() => {
    if (dataSource !== 'espo') return null;
    if (!addressKey) return null;
    if (walletUtxoCache.utxos.length === 0 && walletUtxoCache.height === 0) return null;
    const p2wpkhAddress = account?.nativeSegwit?.address;
    const p2trAddress = account?.taproot?.address;
    let p2wpkh = 0;
    let p2tr = 0;
    for (const utxo of walletUtxoCache.utxos) {
      if (utxo.address === p2wpkhAddress) p2wpkh += utxo.value;
      if (utxo.address === p2trAddress) p2tr += utxo.value;
    }
    return {
      p2wpkh,
      p2tr,
      total: p2wpkh + p2tr,
      pendingIn: 0,
      pendingOut: 0,
    };
  }, [account, addressKey, dataSource, walletUtxoCache.height, walletUtxoCache.utxos]);

  const btcFast = btcFastFromWalletCache ?? btcFastQuery.data ?? null;

  const espoAlkanesFromWalletCache = useMemo<AlkaneAsset[] | null>(() => {
    if (dataSource !== 'espo') return null;
    if (!addressKey) return null;
    if (walletUtxoCache.utxos.length === 0 && walletUtxoCache.height === 0) return null;

    const cachedBalances = walletUtxoCache.balances;
    const metadataById = new Map<string, AlkaneAsset>();
    for (const alkane of alkaneQuery.data ?? []) {
      metadataById.set(alkane.alkaneId, alkane);
    }

    const seen = new Set<string>();
    const out: AlkaneAsset[] = [];

    for (const alkane of alkaneQuery.data ?? []) {
      const amount = cachedBalances.get(alkane.alkaneId) ?? 0n;
      if (amount <= 0n) continue;
      seen.add(alkane.alkaneId);
      out.push({
        ...alkane,
        balance: amount.toString(),
      });
    }

    const extraIds = [...cachedBalances.entries()]
      .filter(([id, amount]) => amount > 0n && !seen.has(id))
      .map(([id]) => id)
      .sort((a, b) => {
        const [aBlock, aTx] = a.split(':').map(Number);
        const [bBlock, bTx] = b.split(':').map(Number);
        return (aBlock - bBlock) || (aTx - bTx);
      });

    for (const id of extraIds) {
      const amount = cachedBalances.get(id) ?? 0n;
      const metadata = metadataById.get(id);
      out.push({
        alkaneId: id,
        name: metadata?.name || id,
        symbol: metadata?.symbol || id,
        balance: amount.toString(),
        decimals: metadata?.decimals ?? 8,
        logo: metadata?.logo,
        priceUsd: metadata?.priceUsd,
        priceInSatoshi: metadata?.priceInSatoshi,
      });
    }

    return out;
  }, [
    addressKey,
    dataSource,
    alkaneQuery.data,
    walletUtxoCache.balances,
    walletUtxoCache.height,
    walletUtxoCache.utxos.length,
  ]);

  const addressAlkanes = alkaneQuery.data ?? EMPTY_ALKANES;
  const displayAlkanes = espoAlkanesFromWalletCache ?? addressAlkanes;

  const refresh = useCallback(async () => {
    const tasks: Promise<unknown>[] = [refetchBtc(), refetchAlkanes()];
    if (dataSource === 'espo') {
      tasks.push(queryClient.refetchQueries({
        queryKey: queryKeys.account.walletUtxoCache(network || 'mainnet', addressKey),
      }));
    } else {
      tasks.push(refetchBtcFast());
    }
    await Promise.all(tasks);
  }, [addressKey, dataSource, network, queryClient, refetchAlkanes, refetchBtc, refetchBtcFast]);

  const refreshAlkanes = useCallback(async () => {
    await refetchAlkanes();
  }, [refetchAlkanes]);

  const refreshBtcFast = useCallback(async () => {
    if (dataSource === 'espo') {
      await queryClient.refetchQueries({
        queryKey: queryKeys.account.walletUtxoCache(network || 'mainnet', addressKey),
      });
    } else {
      await refetchBtcFast();
    }
  }, [addressKey, dataSource, network, queryClient, refetchBtcFast]);

  // Merge BTC data + alkane data into the unified WalletBalances shape.
  // Memoized to prevent new object references on every render — both
  // BitcoinBalanceCard and AlkanesBalancesCard consume this hook, so
  // unstable refs cascade re-renders through the entire wallet page.
  const balances: WalletBalances = useMemo(() => {
    const fastBitcoin = btcFast
      ? {
        ...EMPTY_BALANCES.bitcoin,
        p2wpkh: btcFast.p2wpkh,
        p2tr: btcFast.p2tr,
        total: btcFast.total,
        spendable: btcFast.total,
      }
      : undefined;
    if (btcQuery.data) {
      return {
        ...btcQuery.data.balances,
        bitcoin: fastBitcoin ?? btcQuery.data.balances.bitcoin,
        alkanes: displayAlkanes,
      };
    }
    return {
      ...EMPTY_BALANCES,
      bitcoin: fastBitcoin ?? EMPTY_BALANCES.bitcoin,
      alkanes: displayAlkanes,
    };
  }, [btcFast, btcQuery.data, displayAlkanes]);

  const errorMsg = btcQuery.error
    ? (btcQuery.error instanceof Error ? btcQuery.error.message : 'Failed to fetch wallet data')
    : alkaneQuery.error
      ? (alkaneQuery.error instanceof Error ? alkaneQuery.error.message : 'Failed to fetch alkane balances')
      : null;

  return useMemo(() => ({
    balances,
    addressAlkanes,
    spendableAlkanes: displayAlkanes,
    btcFast,
    utxos: btcQuery.data?.utxos ?? EMPTY_UTXOS,
    isLoading: btcQuery.isLoading || alkaneQuery.isLoading,
    isBtcLoading: btcQuery.isLoading,
    isBtcFastLoading: dataSource === 'espo' ? false : btcFastQuery.isLoading,
    isAlkanesLoading: alkaneQuery.isLoading,
    error: errorMsg,
    refresh,
    refreshAlkanes,
    refreshBtcFast,
  }), [
    addressAlkanes,
    balances,
    btcFast,
    btcQuery.data?.utxos,
    btcQuery.isLoading,
    alkaneQuery.isLoading,
    btcFastQuery.isLoading,
    dataSource,
    errorMsg,
    displayAlkanes,
    refresh,
    refreshAlkanes,
    refreshBtcFast,
  ]);
}
