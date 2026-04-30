/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 * This hook is a compatibility shim that returns the WASM WebProvider from context.
 *
 * Single-address wallets opt out of `protect_taproot` by default. Per Casuwu:
 * alkanes are protected by the protostone return path (the SDK routes any
 * alkane balance from a spent UTXO to a designated output), so refusing to
 * spend alkane-bearing taproot UTXOs as fees is unnecessarily restrictive —
 * and causes "Insufficient funds: have 0 (protect_taproot=true)" on wallets
 * where taproot is the only fee source: keystore (we made it taproot-only)
 * and UniSat (always single-address).
 *
 * Dual-address wallets (Xverse, Leather, OYL) keep the SDK default.
 * Per-call values from the mutation hook still take precedence — useSwap /
 * useWrap pass `protectTaproot: isDualAddress` and `paymentUtxos` explicitly.
 */

import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { extendProvider, ExtendedWebProvider } from '@/lib/alkanes/extendedProvider';
import type { AlkanesExecuteTypedParams } from '@/lib/alkanes/types';

export function useSandshrewProvider(): ExtendedWebProvider | null {
  const { provider, network } = useAlkanesSDK();
  const { walletType, account } = useWallet();

  // Single-address = no segwit fallback for fees:
  //   - keystore (we made it taproot-only by policy)
  //   - browser wallets with only a taproot address (UniSat)
  const isSingleAddressWallet =
    walletType === 'keystore' ||
    (walletType === 'browser' && !!account?.taproot?.address && !account?.nativeSegwit?.address);

  return useMemo(() => {
    if (!provider) return null;
    const base = extendProvider(provider, network);
    if (!isSingleAddressWallet) return base;

    const originalExecuteTyped = base.alkanesExecuteTyped.bind(base);
    const wrappedExecuteTyped = (params: AlkanesExecuteTypedParams) =>
      originalExecuteTyped({
        ...params,
        protectTaproot: params.protectTaproot ?? false,
      });

    // Proxy delegates everything to base except alkanesExecuteTyped.
    // Avoids mutating the shared underlying provider (extendProvider
    // attaches the method directly to the instance, so a mutation here
    // would leak into every other consumer of the same provider).
    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === 'alkanesExecuteTyped') return wrappedExecuteTyped;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as ExtendedWebProvider;
  }, [provider, network, isSingleAddressWallet]);
}
