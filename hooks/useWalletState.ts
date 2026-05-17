/**
 * useWalletState — single React Query hook that consumes the
 * `/api/wallet-state` route (mainnet/regtest) or builds the wallet
 * snapshot client-side via the in-browser fetch interceptor (devnet).
 *
 * Devnet path (added 2026-05-17): The server route rejects `network=devnet`
 * with HTTP 400 because it requires Redis + an external RPC endpoint —
 * neither of which exists for the in-browser devnet. On devnet we run the
 * equivalent fan-out client-side:
 *   1. `esplora_address::utxo` per address (intercepted → in-browser WASM)
 *   2. `alkanes_protorunesbyoutpoint` per dust UTXO (same interceptor)
 *   3. Assemble the WalletState shape walletStateToCache expects
 *
 * This fixes "Insufficient spendable 2:0: need 1459, have 116" — after
 * multiple swap/wrap flows the user's DIESEL is split across many UTXOs;
 * the old empty-cache path let the SDK discover only the most recent
 * change outpoint via its own protorunesbyaddress call.
 *
 * Mainnet/regtest path (unchanged): staleTime: Infinity, HeightPoller
 * invalidates on every block, Redis on server deduplicates cross-client.
 */

'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getWalletBalanceAddresses } from '@/queries/account';
import {
  getAddressUtxos,
  getProtorunesByOutpoint,
  type EsploraUtxo,
} from '@/lib/alkanes/rpc';
import type { WalletState, WalletUtxo, WalletUtxoAlkane } from '@/lib/walletState/fetchWalletState';

export type { WalletState } from '@/lib/walletState/fetchWalletState';

export interface UseWalletStateResult {
  data: WalletState | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

const ALKANE_DUST_MAX = 1000;

async function fetchWalletStateRoute(
  network: string,
  addresses: string[],
): Promise<WalletState> {
  const params = new URLSearchParams({
    addresses: addresses.join(','),
    network,
  });
  const res = await fetch(`/api/wallet-state?${params.toString()}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`wallet-state HTTP ${res.status}`);
  }
  return (await res.json()) as WalletState;
}

/**
 * Client-side wallet state fan-out for devnet.
 *
 * Mirrors fetchWalletState (lib/walletState/fetchWalletState.ts) but
 * runs entirely in the browser so every fetch goes through the devnet
 * interceptor at localhost:18888 → in-browser WASM. The server route
 * rejects network=devnet (no Redis, no external RPC) so this is the
 * only viable path.
 *
 * Uses getAddressUtxos (esplora_address::utxo) then per-dust-UTXO
 * getProtorunesByOutpoint fan-out — same as the server-side canonical
 * path. Avoids protorunesbyaddress because on devnet the address-keyed
 * view only returns the most recent change UTXO, missing earlier alkane
 * UTXOs produced by previous swap/wrap flows in the same session.
 */
async function fetchDevnetWalletState(
  addresses: string[],
): Promise<WalletState> {
  const utxoSettled = await Promise.allSettled(
    addresses.map(async (addr) => {
      const list = await getAddressUtxos('devnet', addr, AbortSignal.timeout(15_000));
      return list.map((u: EsploraUtxo) => ({
        txid: u.txid,
        vout: u.vout,
        value: u.value,
        address: addr,
        blockHeight: u.status?.block_height ?? null,
      }));
    }),
  );

  const rawUtxos: Array<{
    txid: string;
    vout: number;
    value: number;
    address: string;
    blockHeight: number | null;
  }> = [];
  for (const r of utxoSettled) {
    if (r.status === 'fulfilled') rawUtxos.push(...r.value);
  }

  const dustOutpoints = rawUtxos.filter((u) => u.value <= ALKANE_DUST_MAX);
  const balanceSheets = new Map<string, WalletUtxoAlkane[]>();

  if (dustOutpoints.length > 0) {
    const settled = await Promise.allSettled(
      dustOutpoints.map(async (u) => {
        const resp = await getProtorunesByOutpoint(
          'devnet',
          u.txid,
          u.vout,
          AbortSignal.timeout(15_000),
        );
        const balances = resp?.balance_sheet?.cached?.balances ?? [];
        const cleaned: WalletUtxoAlkane[] = [];
        for (const b of balances) {
          const amount = String(b.amount ?? '0');
          if (amount === '0') continue;
          cleaned.push({ block: Number(b.block), tx: Number(b.tx), amount });
        }
        return { key: `${u.txid}:${u.vout}`, alkanes: cleaned };
      }),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled') {
        balanceSheets.set(r.value.key, r.value.alkanes);
      }
    }
  }

  const utxos: WalletUtxo[] = rawUtxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    address: u.address,
    blockHeight: u.blockHeight,
    confirmations: u.blockHeight !== null ? 1 : 0,
    alkanes: balanceSheets.get(`${u.txid}:${u.vout}`) ?? [],
  }));

  let p2wpkh = 0;
  let p2tr = 0;
  let spendable = 0;
  const alkaneTotals = new Map<string, bigint>();
  for (const u of utxos) {
    if (/^(bc1p|tb1p|bcrt1p)/.test(u.address)) p2tr += u.value;
    else p2wpkh += u.value;
    if (u.confirmations >= 1 && u.value > ALKANE_DUST_MAX) spendable += u.value;
    for (const a of u.alkanes) {
      const key = `${a.block}:${a.tx}`;
      alkaneTotals.set(key, (alkaneTotals.get(key) ?? 0n) + BigInt(a.amount));
    }
  }

  const alkanes: Record<string, string> = {};
  for (const [id, amount] of alkaneTotals.entries()) {
    if (amount > 0n) alkanes[id] = amount.toString();
  }

  return {
    addresses,
    metashrewHeight: 0,
    bitcoindHeight: 0,
    tipHash: '',
    utxos,
    btcSats: { p2wpkh, p2tr, total: p2wpkh + p2tr, spendable },
    alkanes,
  };
}

export function useWalletState(): UseWalletStateResult {
  const { account, network, isConnected } = useWallet();
  const addresses = useMemo(() => {
    return getWalletBalanceAddresses(account).sort();
  }, [account]);
  const addressKey = addresses.join(',');
  const net = network || 'mainnet';
  const isDevnet = net === 'devnet';

  const query = useQuery<WalletState>({
    queryKey: ['wallet-state', net, addressKey],
    enabled: isConnected && addresses.length > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: isDevnet
      ? () => fetchDevnetWalletState(addresses)
      : () => fetchWalletStateRoute(net, addresses),
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
  };
}
