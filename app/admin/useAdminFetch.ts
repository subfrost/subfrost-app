/**
 * Hook for making authenticated admin API requests.
 * Uses session tokens (x-admin-token header).
 */
'use client';

import { useCallback } from 'react';

const TOKEN_KEY = 'admin-token';
const USER_KEY = 'admin-user';

export interface AdminUserInfo {
  id: string;
  username: string;
  displayName: string | null;
  permissions: string[];
}

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getAdminUser(): AdminUserInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, user: AdminUserInfo) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAdminSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function useAdminFetch() {
  const adminFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = getAdminToken();
    if (!token) throw new Error('Not authenticated');

    const headers = new Headers(options.headers);
    headers.set('x-admin-token', token);

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      clearAdminSession();
      throw new Error('Unauthorized');
    }

    return res;
  }, []);

  return adminFetch;
}
