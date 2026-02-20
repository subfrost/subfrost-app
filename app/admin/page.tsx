/**
 * Admin Panel — IAM-secured management interface
 *
 * Access: Navigate to /admin directly (not linked from navigation).
 * Auth: Username + password login creates a 24h session token.
 *       Legacy ADMIN_SECRET still works as a fallback.
 */
'use client';

import { useState, useEffect } from 'react';
import PageContent from '@/app/components/PageContent';
import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import AdminTabs from './AdminTabs';
import {
  getAdminToken,
  getAdminUser,
  setAdminSession,
  clearAdminSession,
  type AdminUserInfo,
} from './useAdminFetch';
import { useHydrated } from '@/hooks/useHydrated';

export default function AdminPage() {
  const hydrated = useHydrated();
  const [authed, setAuthed] = useState(false);
  const [userInfo, setUserInfo] = useState<AdminUserInfo | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // Check if already authenticated
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const headers: Record<string, string> = {};
    // Detect if it's a legacy secret
    if (!sessionStorage.getItem('admin-token') && sessionStorage.getItem('admin-secret')) {
      headers['x-admin-secret'] = token;
    } else {
      headers['x-admin-token'] = token;
    }

    fetch('/api/admin/auth/me', { headers })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUserInfo(data.user);
          setAuthed(true);
        } else {
          clearAdminSession();
        }
      })
      .catch(() => clearAdminSession());
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');

    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setAdminSession(data.token, data.user);
        setUserInfo(data.user);
        setAuthed(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Login failed');
      }
    } catch {
      setError('Failed to connect');
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    const token = getAdminToken();
    if (token) {
      fetch('/api/admin/auth/logout', {
        method: 'POST',
        headers: { 'x-admin-token': token },
      }).catch(() => {});
    }
    clearAdminSession();
    setAuthed(false);
    setUserInfo(null);
    setUsername('');
    setPassword('');
  };

  if (!authed) {
    return (
      <PageContent>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="w-full max-w-sm rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-8">
            <h1 className="mb-6 text-xl font-bold text-[color:var(--sf-text)]">Admin Access</h1>
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                  autoComplete="current-password"
                />
              </div>
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                type="submit"
                disabled={!hydrated || checking || !username || !password}
                className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                {!hydrated ? 'Loading...' : checking ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <AlkanesMainWrapper
        header={
          <PageHeader
            title="Admin Panel"
            subtitle={userInfo ? `Signed in as ${userInfo.displayName || userInfo.username}` : 'Management'}
            actions={
              <button
                onClick={handleLogout}
                className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1.5 text-xs text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]"
              >
                Sign Out
              </button>
            }
          />
        }
      >
        <AdminTabs userPermissions={userInfo?.permissions || []} />
      </AlkanesMainWrapper>
    </PageContent>
  );
}
