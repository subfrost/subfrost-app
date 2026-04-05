/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 * This hook is a compatibility shim that returns the WASM WebProvider from context.
 */

import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { extendProvider, ExtendedWebProvider } from '@/lib/alkanes/extendedProvider';

export function useSandshrewProvider(): ExtendedWebProvider | null {
  const { provider, network } = useAlkanesSDK();

  // Extend the provider with alkanesExecuteTyped method.
  // Inject network so execute.ts can reliably detect devnet without
  // requiring every hook to pass network explicitly.
  const extendedProvider = useMemo(() => {
    if (!provider) return null;
    return extendProvider(provider, network);
  }, [provider, network]);

  return extendedProvider;
}
