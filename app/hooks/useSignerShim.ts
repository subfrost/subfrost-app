'use client';

import { useMemo } from 'react';
import { useWallet } from '@/app/contexts/WalletContext';

/**
 * Minimal signer shim to adapt LaserEyes wallet to the OYL SDK signer interface.
 * This assumes the underlying provider exposes a `signPsbt` method.
 */
export function useSignerShim() {
  const wallet = useWallet();
  const signer = useMemo(() => {
    return {
      // @ts-ignore - SDK expects a signer with signPsbt-like capability
      async signPsbt(psbt: string | Uint8Array) {
        if (!(wallet as any).signPsbt) {
          throw new Error('Wallet does not support signPsbt');
        }
        return await (wallet as any).signPsbt(psbt);
      },
    };
  }, [wallet]);
  return signer as any;
}


