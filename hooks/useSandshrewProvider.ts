/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 * This hook is a compatibility shim that returns the WASM WebProvider from context.
 *
 * JOURNAL (2026-04-30): Added a default-injection layer for `alkanesExecuteTyped`.
 * When the connected wallet is a keystore wallet exposing only a taproot address
 * (no native segwit — e.g. the boot wallet, or a user keystore with segwit not
 * surfaced), the SDK's default `protect_taproot=true` excludes ALL taproot UTXOs
 * from fee selection because it can't tell which carry alkanes. With taproot the
 * only fee source, the candidate set is empty and every alkane mutation fails
 * with "Insufficient funds: have 0".
 *
 * The fix: when the wallet is keystore-single-address AND the caller didn't
 * already specify `paymentUtxos`/`protectTaproot`, query the taproot UTXO set,
 * subtract alkane-bearing outpoints (via the protorunes index), and pre-fill
 * `paymentUtxos` (clean BTC-only UTXOs) + `protectTaproot=false`. With explicit
 * payment_utxos set, the SDK uses only those for fees and ignores the
 * protection — we've answered its question for it.
 *
 * Fail-closed: if discovery fails, we leave params untouched and the SDK takes
 * its default behavior (which errors loudly rather than silently spending an
 * alkane UTXO as fee).
 */

import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { useWallet } from '@/context/WalletContext';
import { extendProvider, ExtendedWebProvider } from '@/lib/alkanes/extendedProvider';
import type { AlkanesExecuteTypedParams } from '@/lib/alkanes/types';

export function useSandshrewProvider(): ExtendedWebProvider | null {
  const { provider, network } = useAlkanesSDK();
  const { walletType, account } = useWallet();

  const taprootAddress = account?.taproot?.address;
  const segwitAddress = account?.nativeSegwit?.address;
  // Scope the auto-injection to regtest/devnet networks where the matrix is
  // verified. Mainnet keystore wallets technically have the same shape
  // (nativeSegwit.address is `''`), but we don't want to expand the change
  // surface to mainnet without explicit verification — the protorunes index
  // there could in theory have stale data, and a false-clean classification
  // would cost real BTC. Mainnet keeps the existing well-trodden path.
  const REGTEST_NETWORKS = new Set(['devnet', 'regtest', 'regtest-local', 'subfrost-regtest', 'qubitcoin-regtest', 'oylnet']);
  const isKeystoreSingleAddress =
    walletType === 'keystore' &&
    !!taprootAddress &&
    !segwitAddress &&
    REGTEST_NETWORKS.has(network);

  const extendedProvider = useMemo(() => {
    if (!provider) return null;
    const base = extendProvider(provider, network);

    if (!isKeystoreSingleAddress || !taprootAddress) {
      return base;
    }

    // Wrap alkanesExecuteTyped to inject payment_utxos + protect_taproot=false
    // when the caller didn't already specify them. Per-call overrides take
    // precedence — passing explicit `paymentUtxos`/`protectTaproot` skips the
    // injection.
    const originalExecuteTyped = base.alkanesExecuteTyped.bind(base);
    base.alkanesExecuteTyped = async (params: AlkanesExecuteTypedParams) => {
      if (params.paymentUtxos !== undefined || params.protectTaproot !== undefined) {
        return originalExecuteTyped(params);
      }
      try {
        const { getCleanTaprootBtcUtxos } = await import('@/lib/wallet/taprootCleanUtxos');
        const clean = await getCleanTaprootBtcUtxos(taprootAddress, network);
        if (clean && clean.length) {
          console.log(
            '[useSandshrewProvider] Keystore single-address: injecting',
            clean.length,
            'clean BTC UTXOs as payment_utxos (protect_taproot=false)',
          );
          return originalExecuteTyped({
            ...params,
            paymentUtxos: clean,
            protectTaproot: false,
          });
        }
      } catch (e) {
        console.warn('[useSandshrewProvider] Keystore single-address discovery failed:', (e as Error)?.message);
      }
      return originalExecuteTyped(params);
    };

    return base;
  }, [provider, network, isKeystoreSingleAddress, taprootAddress]);

  return extendedProvider;
}
