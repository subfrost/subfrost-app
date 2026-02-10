import { useState, useEffect } from 'react';

/**
 * Returns true only after the component has mounted on the client.
 * Use this to disable buttons/forms that depend on React event handlers
 * being attached — prevents the "looks interactive but isn't" gap
 * between SSR HTML rendering and React hydration.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
