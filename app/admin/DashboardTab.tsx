'use client';

import { useEffect, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface Stats {
  totalCodes: number;
  activeCodes: number;
  inactiveCodes: number;
  totalRedemptions: number;
  totalUsers: number;
  recentRedemptions: Array<{
    id: string;
    taprootAddress: string;
    redeemedAt: string;
    inviteCode: { code: string };
  }>;
  topCodes: Array<{
    id: string;
    code: string;
    description: string | null;
    isActive: boolean;
    _count: { redemptions: number };
  }>;
}

export default function DashboardTab() {
  const adminFetch = useAdminFetch();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await adminFetch('/api/admin/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminFetch]);

  if (loading) return <div className="text-[color:var(--sf-muted)]">Loading...</div>;
  if (error) return <div className="text-red-400">{error}</div>;
  if (!stats) return null;

  const cards = [
    { label: 'Total Codes', value: stats.totalCodes },
    { label: 'Active Codes', value: stats.activeCodes },
    { label: 'Inactive Codes', value: stats.inactiveCodes },
    { label: 'Total Redemptions', value: stats.totalRedemptions },
    { label: 'Total Users', value: stats.totalUsers },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4"
          >
            <div className="text-xs text-[color:var(--sf-muted)]">{card.label}</div>
            <div className="mt-1 text-2xl font-bold text-[color:var(--sf-text)]">
              {card.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent redemptions */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
            Recent Redemptions
          </h3>
          {stats.recentRedemptions.length === 0 ? (
            <div className="text-sm text-[color:var(--sf-muted)]">No redemptions yet</div>
          ) : (
            <div className="space-y-3">
              {stats.recentRedemptions.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono text-[color:var(--sf-text)]">
                      {r.inviteCode.code}
                    </span>
                    <span className="ml-2 text-[color:var(--sf-muted)]">
                      {r.taprootAddress.slice(0, 10)}...{r.taprootAddress.slice(-4)}
                    </span>
                  </div>
                  <span className="text-xs text-[color:var(--sf-muted)]">
                    {new Date(r.redeemedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top codes */}
        <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
            Top Codes by Redemptions
          </h3>
          {stats.topCodes.length === 0 ? (
            <div className="text-sm text-[color:var(--sf-muted)]">No codes yet</div>
          ) : (
            <div className="space-y-3">
              {stats.topCodes.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[color:var(--sf-text)]">{c.code}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        c.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <span className="font-medium text-[color:var(--sf-text)]">
                    {c._count.redemptions}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
