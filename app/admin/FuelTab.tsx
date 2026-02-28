'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface FuelAllocation {
  id: string;
  address: string;
  amount: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function FuelTab() {
  const adminFetch = useAdminFetch();
  const [allocations, setAllocations] = useState<FuelAllocation[]>([]);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Create/Edit form
  const [showForm, setShowForm] = useState(false);
  const [formAddress, setFormAddress] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchAllocations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/fuel');
      if (!res.ok) throw new Error('Failed to fetch allocations');
      const data = await res.json();
      setAllocations(data.allocations);
      setTotalAllocated(data.totalAllocated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { fetchAllocations(); }, [fetchAllocations]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: formAddress,
          amount: parseFloat(formAmount),
          note: formNote || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setShowForm(false);
      setFormAddress('');
      setFormAmount('');
      setFormNote('');
      fetchAllocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const editAllocation = (alloc: FuelAllocation) => {
    setFormAddress(alloc.address);
    setFormAmount(String(alloc.amount));
    setFormNote(alloc.note || '');
    setShowForm(true);
  };

  const deleteAllocation = async (alloc: FuelAllocation) => {
    if (!confirm(`Delete FUEL allocation for ${alloc.address}?`)) return;
    try {
      const res = await adminFetch(`/api/admin/fuel/${alloc.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      fetchAllocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const [amountSort, setAmountSort] = useState<'asc' | 'desc' | null>(null);

  const toggleAmountSort = () => {
    setAmountSort((s) => (s === 'desc' ? 'asc' : 'desc'));
  };

  const filtered = (() => {
    let list = search
      ? allocations.filter(
          (a) =>
            a.address.toLowerCase().includes(search.toLowerCase()) ||
            a.note?.toLowerCase().includes(search.toLowerCase())
        )
      : allocations;
    if (amountSort) {
      list = [...list].sort((a, b) =>
        amountSort === 'asc' ? a.amount - b.amount : b.amount - a.amount
      );
    }
    return list;
  })();

  if (loading) return <div className="text-[color:var(--sf-muted)]">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Stats + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-4 py-2">
            <span className="text-xs text-[color:var(--sf-muted)]">Total Allocated: </span>
            <span className="text-sm font-bold text-[color:var(--sf-text)]">
              {totalAllocated.toLocaleString()} FUEL
            </span>
          </div>
          <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] px-4 py-2">
            <span className="text-xs text-[color:var(--sf-muted)]">Addresses: </span>
            <span className="text-sm font-bold text-[color:var(--sf-text)]">{allocations.length}</span>
          </div>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setFormAddress('');
              setFormAmount('');
              setFormNote('');
            } else {
              setShowForm(true);
            }
          }}
          className="rounded-lg bg-[color:var(--sf-primary)] px-3 py-1.5 text-xs text-white hover:opacity-90"
        >
          {showForm ? 'Cancel' : 'Add Allocation'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6"
        >
          <h4 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">
            {formAddress && allocations.some((a) => a.address === formAddress)
              ? 'Edit Allocation'
              : 'New Allocation'}
          </h4>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">
                Wallet Address (taproot or segwit)
              </label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 font-mono text-sm text-[color:var(--sf-text)]"
                placeholder="bc1p... or bc1q..."
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">FUEL Amount</label>
              <input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                min={0}
                step="0.01"
                required
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Note (optional)</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              className="h-9 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
              placeholder="e.g., Beta tester, Airdrop batch 1"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Allocation'}
          </button>
        </form>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by address or note..."
        className="h-9 w-full max-w-md rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
      />

      {/* Allocations table */}
      <div className="overflow-x-auto rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--sf-glass-border)]">
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Address</th>
              <th
                className="p-3 text-right text-xs font-medium text-[color:var(--sf-muted)] cursor-pointer select-none hover:text-[color:var(--sf-text)]"
                onClick={toggleAmountSort}
              >
                Amount
                {amountSort === null ? (
                  <span className="ml-1 opacity-40">&uarr;&darr;</span>
                ) : (
                  <span className="ml-1">{amountSort === 'asc' ? '\u2191' : '\u2193'}</span>
                )}
              </th>
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Note</th>
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Updated</th>
              <th className="p-3 text-right text-xs font-medium text-[color:var(--sf-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-[color:var(--sf-muted)]">
                  {search ? 'No matching allocations' : 'No allocations yet'}
                </td>
              </tr>
            ) : (
              filtered.map((alloc) => (
                <tr key={alloc.id} className="border-b border-[color:var(--sf-glass-border)] last:border-0">
                  <td className="p-3 font-mono text-xs text-[color:var(--sf-text)]">
                    <span title={alloc.address}>
                      {alloc.address.slice(0, 14)}...{alloc.address.slice(-6)}
                    </span>
                  </td>
                  <td className="p-3 text-right font-medium text-[color:var(--sf-text)]">
                    {alloc.amount.toLocaleString()}
                  </td>
                  <td className="p-3 text-[color:var(--sf-muted)]">{alloc.note || '-'}</td>
                  <td className="p-3 text-xs text-[color:var(--sf-muted)]">
                    {new Date(alloc.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => editAllocation(alloc)}
                        className="rounded px-2 py-1 text-xs text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteAllocation(alloc)}
                        className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
