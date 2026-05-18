'use client';

/**
 * Shared executor for frostlend mutations — wraps `provider.alkanesExecuteTyped`
 * with the canonical subfrost-appx address pattern (`useActualAddresses` per
 * CLAUDE.md). Each frostlend mutation hook calls into this with its own
 * protostone + inputRequirements.
 *
 * Why this exists: every mutation hook in the app duplicates the same 30 lines
 * of address-resolution logic. For frostlend (open/adjust/close/SP-deposit/
 * SP-withdraw/redeem/liquidate) we'd duplicate it 7+ times. This extracts it.
 *
 * The `useActualAddresses` flag is mandatory (CLAUDE.md): if false on devnet,
 * symbolic `p2tr:0` resolves to the SDK wallet's derivation (coinType=1) and
 * tokens land at the wrong address — verified loss incidents on file.
 */

import { useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { alkanesExecuteTyped } from '@/lib/alkanes/execute';
import { getAddressUtxos, getProtorunesByOutpoint } from '@/lib/alkanes/rpc';

export type FrostlendExecuteParams = {
  protostones: string;
  inputRequirements: string;
  feeRate: number;
  /**
   * When true, taproot address is excluded from fromAddresses for fee-source
   * selection. NOTE: This also prevents alkane input discovery at taproot
   * (both use the same from_addresses parameter in execute.rs select_utxos).
   * Do NOT use for any operation whose inputRequirements includes an alkane at taproot.
   * Auth token protection is now via cachedUtxos prefetched_utxos (not this flag).
   * This flag is preserved for deploy-time calls that genuinely have no alkane inputs.
   */
  skipTaprootFeeSources?: boolean;
};

export function useFrostlendExecute() {
  const { account, network, isConnected, walletType } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const execute = useCallback(async (params: FrostlendExecuteParams): Promise<{ txid: string }> => {
    if (!isConnected) throw new Error('Wallet not connected');
    if (!provider || !isInitialized) throw new Error('Alkanes SDK not initialized');

    const taprootAddress = account?.taproot?.address;
    const segwitAddress = account?.nativeSegwit?.address;
    const primaryAddress = taprootAddress || segwitAddress;
    if (!primaryAddress) throw new Error('No wallet address available');

    const isBrowserWallet = walletType === 'browser';
    // CLAUDE.md mandate — devnet MUST use actual addresses; symbolic addresses
    // resolve to the SDK's keystore-derivation address, which on devnet differs
    // from the connected wallet's derivation (coinType=1 vs coinType=0).
    const useActualAddresses =
      isBrowserWallet ||
      network === 'devnet' ||
      network === 'regtest-local' ||
      network === 'qubitcoin-regtest';

    // When skipTaprootFeeSources=true, exclude taproot from fee-source addresses.
    // Auth token UTXOs are issued to taproot (alkanesChangeAddress). alkanesExecuteFull
    // ignores payment_utxos, so this is the only way to prevent auth token UTXOs from
    // being silently consumed as BTC fee inputs during non-trove ops (SP, oracle).
    const feeSourceAddresses = useActualAddresses
      ? (params.skipTaprootFeeSources
          ? [segwitAddress].filter(Boolean)
          : [segwitAddress, taprootAddress].filter(Boolean)) as string[]
      : ['p2tr:0'];
    const fromAddresses = feeSourceAddresses.length > 0 ? feeSourceAddresses : (useActualAddresses ? [primaryAddress] : ['p2tr:0']);
    const toAddresses = useActualAddresses ? [primaryAddress] : ['p2tr:0'];
    const changeAddress = useActualAddresses
      ? segwitAddress || taprootAddress
      : 'p2wpkh:0';
    const alkanesChangeAddress = useActualAddresses ? primaryAddress : 'p2tr:0';

    const isKeystoreWallet = walletType === 'keystore';
    const isDualAddress = Boolean(segwitAddress && taprootAddress);

    // Build cachedUtxos with alkane annotations so alkanesExecuteTyped can:
    // 1. Pass clean BTC UTXOs as payment_utxos (exclude dust/alkane UTXOs from fee inputs)
    // 2. Pass prefetched_utxos to the WASM so select_utxos knows which UTXOs carry alkanes
    //    and skips them for BTC fee selection.
    //
    // WHY: paymentUtxos (passed as payment_utxos in options_json) is silently ignored by
    // the WASM binary — grep shows 0 occurrences of "payment_utxos" in alkanes_web_sys_bg.js.
    // prefetched_utxos IS parsed (alkanes-rs PR #259), and select_utxos reads the alkanes
    // field to determine which UTXOs are safe to use for BTC fees. Auth token UTXOs (546 sats,
    // alkanes: [{block:2, tx:6}]) will be skipped because alkanes.length > 0.
    //
    // CONFIRMED BUG (Run 31, 2026-05-17): [2:6] trove auth token was burned as fee input
    // during SP deposit despite presplit correctly isolating it. paymentUtxos had no effect.
    // This cachedUtxos approach is the correct fix.
    type CachedUtxo = {
      txid: string;
      vout: number;
      value: number;
      alkanes: Array<{ block: number; tx: number; amount: bigint }>;
      address?: string;
    };
    let cachedUtxos: CachedUtxo[] | undefined;
    if (useActualAddresses && network) {
      try {
        const addrs = [segwitAddress, taprootAddress].filter(Boolean) as string[];
        const allUtxos = (await Promise.all(addrs.map((a) => getAddressUtxos(network, a)))).flat();
        // Fan out protorunes query for dust UTXOs to get alkane annotations.
        // Non-dust UTXOs are asserted clean (alkanes:[]) — no query needed.
        const annotated = await Promise.all(allUtxos.map(async (u) => {
          if (u.value > 1000) {
            // Non-dust: assert clean, no alkane query.
            return { txid: u.txid, vout: u.vout, value: u.value, alkanes: [] as CachedUtxo['alkanes'] };
          }
          // Dust: probe for alkane content so WASM can exclude from fee inputs.
          try {
            const resp = await getProtorunesByOutpoint(network, u.txid, u.vout);
            const balances = resp?.balance_sheet?.cached?.balances ?? [];
            return {
              txid: u.txid,
              vout: u.vout,
              value: u.value,
              alkanes: balances.map((b) => ({
                block: b.block,
                tx: b.tx,
                amount: BigInt(b.amount),
              })),
            };
          } catch {
            // If probe fails, treat as potentially carrying alkanes (conservative: alkanes:[{dummy}])
            // so WASM avoids it for fees. Better to miss a fee source than burn an auth token.
            return { txid: u.txid, vout: u.vout, value: u.value, alkanes: [{ block: 0, tx: 0, amount: 0n }] };
          }
        }));
        if (annotated.length > 0) {
          cachedUtxos = annotated;
          const dustCount = annotated.filter(u => u.value <= 1000).length;
          console.log(`[frostlend][execute] cachedUtxos: ${annotated.length} UTXOs (${dustCount} dust annotated, will be excluded from fees)`);
        }
      } catch {
        // Non-fatal: fall back to SDK's own UTXO discovery
      }
    }

    let result: any;
    try {
      result = await alkanesExecuteTyped(provider, {
        protostones: params.protostones,
        inputRequirements: params.inputRequirements,
        feeRate: params.feeRate,
        autoConfirm: isKeystoreWallet || network === 'devnet',
        fromAddresses,
        toAddresses,
        changeAddress,
        alkanesChangeAddress,
        ordinalsStrategy: 'exclude',
        protectTaproot: isDualAddress,
        network: network ?? undefined,
        ...(cachedUtxos ? { cachedUtxos } : {}),
      });
    } catch (e: any) {
      // Surface the SDK error message so the UI can show it. Many SDK errors
      // come back as plain strings or objects with `.message` buried in a JSON-RPC envelope.
      const msg =
        e?.message ||
        e?.error?.message ||
        (typeof e === 'string' ? e : '') ||
        JSON.stringify(e).slice(0, 300);
      console.error('[useFrostlendExecute] execute failed:', msg, e);
      throw new Error(msg || 'alkanesExecuteTyped threw without a message');
    }

    const txid: string | undefined = result?.txid || result?.reveal_txid || result?.revealTxid;
    if (!txid) {
      const summary = JSON.stringify(result).slice(0, 300);
      console.error('[useFrostlendExecute] no txid in result:', result);
      throw new Error(`No txid in SDK result: ${summary}`);
    }
    return { txid };
  }, [account, network, isConnected, walletType, provider, isInitialized]);

  return {
    execute,
    primaryAddress: account?.taproot?.address || account?.nativeSegwit?.address || '',
    network: network ?? '',
    ready: isConnected && isInitialized,
  };
}
