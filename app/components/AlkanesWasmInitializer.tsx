'use client';

import { useEffect, useState } from 'react';
import { initAlkanesWasm } from '@/lib/oyl/alkanes/wallet-integration';

/**
 * Initializes Alkanes WASM module on client mount
 * 
 * This component should be rendered once at the root level
 * to ensure WASM is initialized before any wallet operations
 */
export function AlkanesWasmInitializer() {
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await initAlkanesWasm();
        if (mounted) {
          setInitialized(true);
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Alkanes SDK ready');
          }
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setError(errorMessage);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // Don't render anything - this is just for side effects
  // Errors are logged to console for debugging
  return null;
}
