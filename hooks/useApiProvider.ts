/**
 * @deprecated Use useAlkanesSDK from '@/context/AlkanesSDKContext' instead.
 * This hook is a compatibility shim that returns the WASM WebProvider from context.
 */

import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

type Provider = import('@alkanes/ts-sdk/wasm').WebProvider | null;

export function useApiProvider(): Provider {
  const { provider } = useAlkanesSDK();
  return provider;
}
