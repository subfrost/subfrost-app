/**
 * Admin Panel — Invite Code Marketing Program Management
 *
 * Access: Navigate to /admin directly (not linked from navigation).
 * Auth: Enter the ADMIN_SECRET value in the password prompt. Stored in sessionStorage.
 *
 * Marketing program workflow:
 * 1. Create leader codes (Dashboard > Codes > Create Code)
 * 2. Optionally bulk-generate sub-codes under a leader (Bulk Generate tab)
 * 3. Distribute codes to leaders/influencers
 * 4. Monitor redemptions via Dashboard and Redemptions tabs
 * 5. View code hierarchy via Hierarchy tab
 * 6. Deactivate codes when campaigns end (Codes tab > Deactivate)
 * 7. Export redemption data as CSV (Redemptions tab > Export CSV)
 *
 * Required env vars:
 * - ADMIN_SECRET: Shared secret for admin API access
 * - DATABASE_URL: PostgreSQL connection string
 *
 * API routes:
 * - GET  /api/admin/stats             — Dashboard statistics
 * - GET  /api/admin/codes             — List codes (search, filter, paginate)
 * - POST /api/admin/codes             — Create single code
 * - GET  /api/admin/codes/[id]        — Code detail with relations
 * - PATCH /api/admin/codes/[id]       — Update code
 * - DELETE /api/admin/codes/[id]      — Delete code + redemptions
 * - POST /api/admin/codes/bulk        — Bulk generate codes
 * - GET  /api/admin/codes/tree        — Hierarchical code tree
 * - GET  /api/admin/redemptions       — List redemptions (search, filter, paginate)
 * - GET  /api/admin/redemptions/export — CSV download
 */
'use client';

import { useState, useEffect } from 'react';
import PageContent from '@/app/components/PageContent';
import AlkanesMainWrapper from '@/app/components/AlkanesMainWrapper';
import PageHeader from '@/app/components/PageHeader';
import AdminTabs from './AdminTabs';
import { getAdminSecret, setAdminSecret, clearAdminSecret } from './useAdminFetch';

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // Check if already authenticated
  useEffect(() => {
    const existing = getAdminSecret();
    if (existing) {
      // Verify the stored secret is still valid
      fetch('/api/admin/stats', { headers: { 'x-admin-secret': existing } })
        .then((res) => {
          if (res.ok) setAuthed(true);
          else clearAdminSecret();
        })
        .catch(() => clearAdminSecret());
    }
  }, []);

  const [loginMs, setLoginMs] = useState<number | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError('');
    setLoginMs(null);
    const t0 = performance.now();

    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'x-admin-secret': password },
      });
      const elapsed = Math.round(performance.now() - t0);
      setLoginMs(elapsed);
      console.log(`[Admin] Login fetch took ${elapsed}ms, status=${res.status}`);

      if (res.ok) {
        setAdminSecret(password);
        setAuthed(true);
      } else {
        setError(`Invalid admin secret (${elapsed}ms)`);
      }
    } catch {
      const elapsed = Math.round(performance.now() - t0);
      setLoginMs(elapsed);
      setError(`Failed to connect (${elapsed}ms)`);
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    clearAdminSecret();
    setAuthed(false);
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
                  Admin Secret
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                  autoFocus
                />
              </div>
              {error && <div className="text-sm text-red-400">{error}</div>}
              {loginMs !== null && !error && (
                <div className="text-xs text-[color:var(--sf-muted)]">API response: {loginMs}ms</div>
              )}
              <button
                type="submit"
                disabled={checking || !password}
                className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                {checking ? 'Verifying...' : 'Login'}
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
            subtitle="Invite code marketing program management"
            actions={
              <button
                onClick={handleLogout}
                className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1.5 text-xs text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]"
              >
                Logout
              </button>
            }
          />
        }
      >
        <AdminTabs />
      </AlkanesMainWrapper>
    </PageContent>
  );
}
