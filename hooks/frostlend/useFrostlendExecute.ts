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

export type FrostlendExecuteParams = {
  protostones: string;
  inputRequirements: string;
  feeRate: number;
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

    const fromAddresses = useActualAddresses
      ? ([segwitAddress, taprootAddress].filter(Boolean) as string[])
      : ['p2tr:0'];
    const toAddresses = useActualAddresses ? [primaryAddress] : ['p2tr:0'];
    const changeAddress = useActualAddresses
      ? segwitAddress || taprootAddress
      : 'p2wpkh:0';
    const alkanesChangeAddress = useActualAddresses ? primaryAddress : 'p2tr:0';

    const isKeystoreWallet = walletType === 'keystore';
    const isDualAddress = Boolean(segwitAddress && taprootAddress);

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
