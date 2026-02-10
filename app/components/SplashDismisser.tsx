'use client';

import { useEffect } from 'react';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';

declare global {
  interface Window {
    __sfSplashReady?: () => void;
  }
}

/**
 * Signals the splash screen to dismiss once the SDK (WASM) is initialized.
 * Renders nothing — purely a side-effect component.
 */
export default function SplashDismisser() {
  const { isInitialized } = useAlkanesSDK();

  useEffect(() => {
    if (isInitialized) {
      window.__sfSplashReady?.();
    }
  }, [isInitialized]);

  return null;
}
