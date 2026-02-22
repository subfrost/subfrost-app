'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';
import CreateCodeModal from './CreateCodeModal';
import EditCodeModal from './EditCodeModal';

function TruncatedAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="inline-flex items-center gap-1.5 font-mono">
      {truncated}
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy address'}
        className="text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)] transition-colors"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        )}
      </button>
    </span>
  );
}

interface Code {
  id: string;
  code: string;
  description: string | null;
  isActive: boolean;
  ownerTaprootAddress: string | null;
  createdAt: string;
  parentCode: { id: string; code: string } | null;
  _count: { redemptions: number; childCodes: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortField = 'code' | 'redemptions' | 'children' | 'parent';
type SortDir = 'asc' | 'desc';

function sortCodes(codes: Code[], field: SortField | null, dir: SortDir): Code[] {
  if (!field) return codes;
  return [...codes].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'code':
        cmp = a.code.localeCompare(b.code);
        break;
      case 'redemptions':
        cmp = a._count.redemptions - b._count.redemptions;
        break;
      case 'children':
        cmp = a._count.childCodes - b._count.childCodes;
        break;
      case 'parent':
        cmp = (a.parentCode?.code || '').localeCompare(b.parentCode?.code || '');
        break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

export default function CodesTab() {
  const adminFetch = useAdminFetch();
  const [codes, setCodes] = useState<Code[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCode, setEditingCode] = useState<Code | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'code' || field === 'parent' ? 'asc' : 'desc');
    }
  };

  const sortedCodes = sortCodes(codes, sortField, sortDir);

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-[color:var(--sf-muted)]/40">&uarr;&darr;</span>;
    return <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>;
  };

  const fetchCodes = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: '25', status: statusFilter });
      if (search) params.set('search', search);
      const res = await adminFetch(`/api/admin/codes?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCodes(data.codes);
      setPagination(data.pagination);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  }, [adminFetch, search, statusFilter]);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  const handleToggle = async (code: Code) => {
    await adminFetch(`/api/admin/codes/${code.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !code.isActive }),
    });
    fetchCodes(pagination.page);
  };

  const handleDelete = async (code: Code) => {
    if (!confirm(`Delete code "${code.code}"? This will also delete all its redemptions.`)) return;
    await adminFetch(`/api/admin/codes/${code.id}`, { method: 'DELETE' });
    fetchCodes(pagination.page);
  };

  // Fetch parent code options for create modal
  const [parentCodes, setParentCodes] = useState<Array<{ id: string; code: string }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/codes?limit=100&status=active');
        if (res.ok) {
          const data = await res.json();
          setParentCodes(data.codes.map((c: Code) => ({ id: c.id, code: c.code })));
        }
      } catch { /* ignore */ }
    })();
  }, [adminFetch]);

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search codes..."
          className="h-10 w-64 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90"
        >
          Create Code
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
                <th className="px-4 py-3 cursor-pointer select-none hover:text-[color:var(--sf-text)]" onClick={() => toggleSort('code')}>Code<SortIndicator field="code" /></th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 cursor-pointer select-none hover:text-[color:var(--sf-text)]" onClick={() => toggleSort('redemptions')}>Redemptions<SortIndicator field="redemptions" /></th>
                <th className="px-4 py-3 cursor-pointer select-none hover:text-[color:var(--sf-text)]" onClick={() => toggleSort('children')}>Children<SortIndicator field="children" /></th>
                <th className="px-4 py-3 cursor-pointer select-none hover:text-[color:var(--sf-text)]" onClick={() => toggleSort('parent')}>Parent<SortIndicator field="parent" /></th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--sf-row-border)]">
              {sortedCodes.map((code) => (
                <tr key={code.id}>
                  <td className="px-4 py-3 font-mono text-[color:var(--sf-text)]">{code.code}</td>
                  <td className="px-4 py-3 text-[color:var(--sf-text)]">
                    {code.ownerTaprootAddress ? (
                      <TruncatedAddress address={code.ownerTaprootAddress} />
                    ) : (
                      <span className="text-[color:var(--sf-muted)]">-</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-[color:var(--sf-muted)]">
                    {code.description || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        code.isActive
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {code.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--sf-text)]">
                    {code._count.redemptions}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--sf-text)]">
                    {code._count.childCodes}
                  </td>
                  <td className="px-4 py-3 text-[color:var(--sf-muted)]">
                    {code.parentCode?.code || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingCode(code)}
                        className="text-xs text-[color:var(--sf-primary)] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggle(code)}
                        className="text-xs text-yellow-400 hover:underline"
                      >
                        {code.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(code)}
                        className="text-xs text-red-400 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {codes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[color:var(--sf-muted)]">
                    No codes found
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
              onClick={() => fetchCodes(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1 text-[color:var(--sf-text)] disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => fetchCodes(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1 text-[color:var(--sf-text)] disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateCodeModal
          parentCodes={parentCodes}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            fetchCodes(pagination.page);
          }}
        />
      )}
      {editingCode && (
        <EditCodeModal
          code={editingCode}
          onClose={() => setEditingCode(null)}
          onUpdated={() => {
            setEditingCode(null);
            fetchCodes(pagination.page);
          }}
        />
      )}
    </div>
  );
}
