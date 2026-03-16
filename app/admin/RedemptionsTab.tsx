'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface Redemption {
  id: string;
  taprootAddress: string;
  segwitAddress: string | null;
  taprootPubkey: string | null;
  redeemedAt: string;
  updatedAt: string | null;
  inviteCode: { id: string; code: string; description: string | null };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortField = 'redeemedAt' | 'updatedAt';
type SortDir = 'asc' | 'desc';

export default function RedemptionsTab() {
  const adminFetch = useAdminFetch();
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [codeFilter, setCodeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sortBy, setSortBy] = useState<SortField | ''>('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCodeId, setEditCodeId] = useState('');
  const [editSearch, setEditSearch] = useState('');
  const [editDropdownOpen, setEditDropdownOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const editRef = useRef<HTMLDivElement>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // All codes for the edit dropdown
  const [allCodes, setAllCodes] = useState<Array<{ id: string; code: string }>>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/codes?limit=0&status=active');
        if (res.ok) {
          const data = await res.json();
          setAllCodes(data.codes.map((c: { id: string; code: string }) => ({ id: c.id, code: c.code })));
        }
      } catch { /* ignore */ }
    })();
  }, [adminFetch]);

  // Close edit dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (editRef.current && !editRef.current.contains(e.target as Node)) {
        setEditDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchRedemptions = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);
      if (codeFilter) params.set('code', codeFilter);
      if (sortBy) {
        params.set('sortBy', sortBy);
        params.set('sortDir', sortDir);
      }
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
  }, [adminFetch, search, codeFilter, sortBy, sortDir]);

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

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortBy !== field) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  // Edit handlers
  const startEdit = (r: Redemption) => {
    setEditingId(r.id);
    setEditCodeId(r.inviteCode.id);
    setEditSearch('');
    setEditError('');
    setEditDropdownOpen(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditCodeId('');
    setEditSearch('');
    setEditError('');
    setEditDropdownOpen(false);
  };

  const saveEdit = async () => {
    if (!editingId || !editCodeId) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await adminFetch(`/api/admin/redemptions/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId: editCodeId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update');
      }
      cancelEdit();
      fetchRedemptions(pagination.page);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setEditSaving(false);
    }
  };

  // Delete handlers
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await adminFetch(`/api/admin/redemptions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      setDeleteConfirmId(null);
      fetchRedemptions(pagination.page);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredEditCodes = allCodes.filter((c) =>
    c.code.toLowerCase().includes(editSearch.toLowerCase())
  );
  const selectedEditCode = allCodes.find((c) => c.id === editCodeId);

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
                <th
                  className="cursor-pointer select-none px-4 py-3 hover:text-[color:var(--sf-text)]"
                  onClick={() => handleSort('redeemedAt')}
                >
                  Redeemed At{sortIndicator('redeemedAt')}
                </th>
                <th
                  className="cursor-pointer select-none px-4 py-3 hover:text-[color:var(--sf-text)]"
                  onClick={() => handleSort('updatedAt')}
                >
                  Last Modified{sortIndicator('updatedAt')}
                </th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--sf-row-border)]">
              {redemptions.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-[color:var(--sf-text)]">
                    {editingId === r.id ? (
                      <div ref={editRef} className="relative min-w-[160px]">
                        <input
                          type="text"
                          value={editDropdownOpen ? editSearch : (selectedEditCode?.code || '')}
                          onChange={(e) => {
                            setEditSearch(e.target.value);
                            setEditDropdownOpen(true);
                          }}
                          onFocus={() => {
                            setEditSearch('');
                            setEditDropdownOpen(true);
                          }}
                          className="h-8 w-full rounded border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-2 text-xs text-[color:var(--sf-text)]"
                        />
                        {editDropdownOpen && (
                          <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] shadow-lg">
                            {filteredEditCodes.map((c) => (
                              <button
                                type="button"
                                key={c.id}
                                onClick={() => {
                                  setEditCodeId(c.id);
                                  setEditSearch('');
                                  setEditDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-[color:var(--sf-glass-bg)] ${c.id === editCodeId ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}
                              >
                                {c.code}
                              </button>
                            ))}
                            {filteredEditCodes.length === 0 && editSearch && (
                              <div className="px-3 py-1.5 text-xs text-[color:var(--sf-muted)]">No codes found</div>
                            )}
                          </div>
                        )}
                        {editError && (
                          <div className="mt-1 text-xs text-red-400">{editError}</div>
                        )}
                      </div>
                    ) : (
                      r.inviteCode.code
                    )}
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
                  <td className="px-4 py-3 text-[color:var(--sf-muted)]">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === r.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={editSaving}
                          className="rounded bg-[color:var(--sf-primary)] px-2 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {editSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded px-2 py-1 text-xs text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : deleteConfirmId === r.id ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deletingId === r.id}
                          className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingId === r.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded px-2 py-1 text-xs text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(r)}
                          className="rounded px-2 py-1 text-xs text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-glass-bg)]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(r.id)}
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-[color:var(--sf-glass-bg)]"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {redemptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[color:var(--sf-muted)]">
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
