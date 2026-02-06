/**
 * Hook for making authenticated admin API requests.
 * Reads the admin secret from sessionStorage and attaches it as x-admin-secret header.
 */
'use client';

import { useCallback } from 'react';

const STORAGE_KEY = 'admin-secret';

export function getAdminSecret(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(STORAGE_KEY);
}

export function setAdminSecret(secret: string) {
  sessionStorage.setItem(STORAGE_KEY, secret);
}

export function clearAdminSecret() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function useAdminFetch() {
  const adminFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const secret = getAdminSecret();
    if (!secret) throw new Error('Not authenticated');

    const headers = new Headers(options.headers);
    headers.set('x-admin-secret', secret);

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      clearAdminSecret();
      throw new Error('Unauthorized');
    }

    return res;
  }, []);

  return adminFetch;
}
