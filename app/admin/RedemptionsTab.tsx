'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface Redemption {
  id: string;
  taprootAddress: string;
  segwitAddress: string | null;
  taprootPubkey: string | null;
  redeemedAt: string;
  inviteCode: { id: string; code: string; description: string | null };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function RedemptionsTab() {
  const adminFetch = useAdminFetch();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const fetchRedemptions = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      if (codeFilter) params.set('code', codeFilter);
      const res = await adminFetch(`/api/admin/redemptions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRedemptions(data.redemptions);
      setPagination(data.pagination);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  }, [adminFetch, search, codeFilter]);

  useEffect(() => { fetchRedemptions(); }, [fetchRedemptions]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await adminFetch('/api/admin/redemptions/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redemptions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search addresses..."
          className="h-10 w-64 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
        />
        <input
          type="text"
          value={codeFilter}
          onChange={(e) => setCodeFilter(e.target.value.toUpperCase())}
          placeholder="Filter by code..."
          className="h-10 w-48 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
        />
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg border border-[color:var(--sf-outline)] px-4 py-2 text-sm text-[color:var(--sf-text)] hover:bg-[color:var(--sf-glass-bg)] disabled:opacity-50"
        >
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-[color:var(--sf-muted)]">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--sf-row-border)] text-left text-xs text-[color:var(--sf-muted)]">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Taproot Address</th>
                <th className="px-4 py-3">Segwit Address</th>
                <th className="px-4 py-3">Redeemed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--sf-row-border)]">
              {redemptions.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-[color:var(--sf-text)]">
                    {r.inviteCode.code}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--sf-text)]">
                    {r.taprootAddress.slice(0, 14)}...{r.taprootAddress.slice(-6)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--sf-muted)]">
                    {r.segwitAddress
                      ? `${r.segwitAddress.slice(0, 10)}...${r.segwitAddress.slice(-4)}`
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--sf-muted)]">
                    {new Date(r.redeemedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {redemptions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[color:var(--sf-muted)]">
                    No redemptions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[color:var(--sf-muted)]">
            Showing {(pagination.page - 1) * pagination.limit + 1}-
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => fetchRedemptions(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1 text-[color:var(--sf-text)] disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => fetchRedemptions(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1 text-[color:var(--sf-text)] disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
