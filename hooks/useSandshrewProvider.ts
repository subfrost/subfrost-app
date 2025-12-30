/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 * This hook is a compatibility shim that returns the WASM WebProvider from context.
 */

import { useMemo } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { extendProvider, ExtendedWebProvider } from '@/lib/alkanes/extendedProvider';

export function useSandshrewProvider(): ExtendedWebProvider | null {
  const { provider } = useAlkanesSDK();

  // Extend the provider with alkanesExecuteTyped method
  const extendedProvider = useMemo(() => {
    if (!provider) return null;
    return extendProvider(provider);
  }, [provider]);

  return extendedProvider;
}
