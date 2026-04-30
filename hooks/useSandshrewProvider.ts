/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 * This hook is a compatibility shim that returns the WASM WebProvider from context.
 *
 * For keystore wallets that only expose a taproot address, the SDK's
 * `protect_taproot=true` default leaves zero fee candidates and every alkane
 * mutation fails with "Insufficient funds: have 0". The wrapper below fills
 * `paymentUtxos`/`protectTaproot` defaults from a per-outpoint classification
 * (lib/wallet/taprootCleanUtxos.ts) when the caller didn't override them.
 */

import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { extendProvider, ExtendedWebProvider } from '@/lib/alkanes/extendedProvider';
import { getCleanTaprootBtcUtxos } from '@/lib/wallet/taprootCleanUtxos';
import type { AlkanesExecuteTypedParams } from '@/lib/alkanes/types';

const isDev = process.env.NODE_ENV !== 'production';

export function useSandshrewProvider(): ExtendedWebProvider | null {
  const { provider, network } = useAlkanesSDK();
  const { walletType, account } = useWallet();

  const taprootAddress = account?.taproot?.address;
  const segwitAddress = account?.nativeSegwit?.address;
  const isKeystoreSingleAddress =
    walletType === 'keystore' && !!taprootAddress && !segwitAddress;

  return useMemo(() => {
    if (!provider) return null;
    const base = extendProvider(provider, network);

    if (!isKeystoreSingleAddress) return base;

    const originalExecuteTyped = base.alkanesExecuteTyped.bind(base);
    const wrappedExecuteTyped = async (params: AlkanesExecuteTypedParams) => {
      if (params.paymentUtxos !== undefined || params.protectTaproot !== undefined) {
        return originalExecuteTyped(params);
      }
      const clean = await getCleanTaprootBtcUtxos(taprootAddress!, network);
      if (!clean || !clean.length) {
        return originalExecuteTyped(params);
      }
      if (isDev) {
        console.log(
          '[useSandshrewProvider] Keystore single-address: injecting',
          clean.length,
          'clean BTC UTXOs as payment_utxos (protect_taproot=false)',
        );
      }
      return originalExecuteTyped({
        ...params,
        paymentUtxos: clean,
        protectTaproot: false,
      });
    };

    // Proxy delegates everything to `base` except `alkanesExecuteTyped`.
    // Avoids mutating the shared underlying provider (extendProvider attaches
    // the method directly to the instance, so any mutation here would leak
    // into every other consumer of the same provider).
    return new Proxy(base, {
      get(target, prop, receiver) {
        if (prop === 'alkanesExecuteTyped') return wrappedExecuteTyped;
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as ExtendedWebProvider;
  }, [provider, network, isKeystoreSingleAddress, taprootAddress]);
}
