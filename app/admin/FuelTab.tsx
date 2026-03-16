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

interface FormEntry {
  address: string;
  amount: string;
  note: string;
}

interface OverwriteWarning {
  existing: { address: string; currentAmount: number }[];
  entriesToSave: { address: string; amount: number; note: string | null }[];
}

const emptyEntry = (): FormEntry => ({ address: '', amount: '', note: '' });

export default function FuelTab() {
  const adminFetch = useAdminFetch();
  const [allocations, setAllocations] = useState<FuelAllocation[]>([]);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Create/Edit form — supports up to 10 entries
  const [showForm, setShowForm] = useState(false);
  const [formEntries, setFormEntries] = useState<FormEntry[]>([emptyEntry()]);
  const [saving, setSaving] = useState(false);
  const [overwriteWarning, setOverwriteWarning] = useState<OverwriteWarning | null>(null);

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

  const updateEntry = (index: number, field: keyof FormEntry, value: string) => {
    setFormEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addMoreEntries = () => {
    setFormEntries((prev) => {
      const toAdd = Math.min(9, 10 - prev.length);
      return [...prev, ...Array.from({ length: toAdd }, emptyEntry)];
    });
  };

  // Handle paste from spreadsheets (tab-separated columns, newline-separated rows)
  const FIELD_ORDER: (keyof FormEntry)[] = ['address', 'amount', 'note'];

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, field: keyof FormEntry) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    // Detect spreadsheet data: contains tabs or multiple lines
    const hasTabsOrNewlines = text.includes('\t') || text.includes('\n');
    if (!hasTabsOrNewlines) {
      // Single value paste — trim and let default behavior handle it, but strip whitespace
      e.preventDefault();
      updateEntry(rowIndex, field, text.trim());
      return;
    }

    e.preventDefault();
    const rows = text.split(/\r?\n/).filter((line) => line.length > 0);
    const startCol = FIELD_ORDER.indexOf(field);

    setFormEntries((prev) => {
      // Ensure we have enough rows (up to 10)
      const needed = rowIndex + rows.length;
      let next = [...prev];
      while (next.length < needed && next.length < 10) {
        next.push(emptyEntry());
      }

      for (let r = 0; r < rows.length && rowIndex + r < 10; r++) {
        const cells = rows[r].split('\t');
        const targetRow = rowIndex + r;
        const updated = { ...next[targetRow] };

        for (let c = 0; c < cells.length && startCol + c < FIELD_ORDER.length; c++) {
          updated[FIELD_ORDER[startCol + c]] = cells[c].trim();
        }

        next[targetRow] = updated;
      }

      return next;
    });
  };

  const removeEntry = (index: number) => {
    setFormEntries((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const buildEntriesToSave = () => {
    return formEntries
      .filter((e) => e.address.trim() && e.amount.trim())
      .map((e) => ({
        address: e.address.trim(),
        amount: parseFloat(e.amount),
        note: e.note.trim() || null,
      }))
      .filter((e) => !isNaN(e.amount) && e.amount >= 0);
  };

  const saveEntries = async (entries: { address: string; amount: number; note: string | null }[]) => {
    setSaving(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          entries.length === 1
            ? { address: entries[0].address, amount: entries[0].amount, note: entries[0].note }
            : { entries }
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setShowForm(false);
      setFormEntries([emptyEntry()]);
      setOverwriteWarning(null);
      fetchAllocations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const entriesToSave = buildEntriesToSave();
    if (entriesToSave.length === 0) {
      setError('Please fill in at least one entry with an address and amount.');
      return;
    }

    // Check for existing allocations that would be overwritten
    const existingMap = new Map(allocations.map((a) => [a.address, a]));
    const existing = entriesToSave
      .filter((e) => existingMap.has(e.address))
      .map((e) => ({ address: e.address, currentAmount: existingMap.get(e.address)!.amount }));

    if (existing.length > 0) {
      setOverwriteWarning({ existing, entriesToSave });
      return;
    }

    await saveEntries(entriesToSave);
  };

  const editAllocation = (alloc: FuelAllocation) => {
    setFormEntries([{ address: alloc.address, amount: String(alloc.amount), note: alloc.note || '' }]);
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
  const [communitySort, setCommunitySort] = useState<'asc' | 'desc' | null>(null);
  const [updatedSort, setUpdatedSort] = useState<'asc' | 'desc' | null>(null);

  const toggleAmountSort = () => {
    setAmountSort((s) => (s === 'desc' ? 'asc' : 'desc'));
    setCommunitySort(null);
    setUpdatedSort(null);
  };

  const toggleCommunitySort = () => {
    setCommunitySort((s) => (s === 'desc' ? 'asc' : 'desc'));
    setAmountSort(null);
    setUpdatedSort(null);
  };

  const toggleUpdatedSort = () => {
    setUpdatedSort((s) => (s === 'desc' ? 'asc' : 'desc'));
    setAmountSort(null);
    setCommunitySort(null);
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
    if (communitySort) {
      list = [...list].sort((a, b) => {
        const noteA = (a.note || '').toLowerCase();
        const noteB = (b.note || '').toLowerCase();
        return communitySort === 'asc'
          ? noteA.localeCompare(noteB)
          : noteB.localeCompare(noteA);
      });
    }
    if (updatedSort) {
      list = [...list].sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime();
        const dateB = new Date(b.updatedAt).getTime();
        return updatedSort === 'asc' ? dateA - dateB : dateB - dateA;
      });
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
              setFormEntries([emptyEntry()]);
              setOverwriteWarning(null);
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
            {formEntries.length === 1 && formEntries[0].address && allocations.some((a) => a.address === formEntries[0].address)
              ? 'Edit Allocation'
              : 'New Allocation'}
          </h4>

          {/* Column headers */}
          <div className="mb-2 hidden items-center gap-3 sm:flex">
            <div className="flex-[3] text-xs text-[color:var(--sf-muted)]">Wallet Address</div>
            <div className="flex-[1] text-xs text-[color:var(--sf-muted)]">FUEL Amount</div>
            <div className="flex-[2] text-xs text-[color:var(--sf-muted)]">Name (optional)</div>
            {formEntries.length > 1 && <div className="w-8" />}
          </div>

          {/* Entry rows */}
          <div className="flex flex-col gap-2">
            {formEntries.map((entry, i) => (
              <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <input
                  type="text"
                  value={entry.address}
                  onChange={(e) => updateEntry(i, 'address', e.target.value)}
                  onPaste={(e) => handlePaste(e, i, 'address')}
                  className="h-9 w-full flex-[3] rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 font-mono text-sm text-[color:var(--sf-text)]"
                  placeholder="bc1p... or bc1q..."
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={entry.amount}
                  onChange={(e) => updateEntry(i, 'amount', e.target.value)}
                  onPaste={(e) => handlePaste(e, i, 'amount')}
                  className="h-9 w-full flex-[1] rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                  placeholder="0.00"
                />
                <input
                  type="text"
                  value={entry.note}
                  onChange={(e) => updateEntry(i, 'note', e.target.value)}
                  onPaste={(e) => handlePaste(e, i, 'note')}
                  className="h-9 w-full flex-[2] rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                  placeholder="e.g., Beta tester"
                />
                {formEntries.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeEntry(i)}
                    className="h-9 w-8 shrink-0 rounded-lg text-xs text-red-400 hover:bg-red-500/10"
                    title="Remove entry"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add more entries button */}
          {formEntries.length < 10 && (
            <button
              type="button"
              onClick={addMoreEntries}
              className="mt-3 rounded-lg border border-dashed border-[color:var(--sf-outline)] px-3 py-1.5 text-xs text-[color:var(--sf-muted)] hover:border-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary)]"
            >
              + Add more entries
            </button>
          )}

          {/* Overwrite warning */}
          {overwriteWarning && (
            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
              <p className="mb-2 text-sm font-medium text-yellow-300">
                These addresses already have an allocation:
              </p>
              <ul className="mb-3 space-y-1">
                {overwriteWarning.existing.map((e) => (
                  <li key={e.address} className="font-mono text-xs text-yellow-200">
                    {e.address.slice(0, 14)}...{e.address.slice(-6)}{' '}
                    <span className="text-yellow-400">({e.currentAmount})</span>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveEntries(overwriteWarning.entriesToSave)}
                  className="rounded-lg bg-yellow-600 px-3 py-1.5 text-xs text-white hover:bg-yellow-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setOverwriteWarning(null)}
                  className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1.5 text-xs text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Save button */}
          {!overwriteWarning && (
            <button
              type="submit"
              disabled={saving}
              className="mt-4 rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Allocation'}
            </button>
          )}
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
              <th
                className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)] cursor-pointer select-none hover:text-[color:var(--sf-text)]"
                onClick={toggleCommunitySort}
              >
                Community
                {communitySort === null ? (
                  <span className="ml-1 opacity-40">&uarr;&darr;</span>
                ) : (
                  <span className="ml-1">{communitySort === 'asc' ? '\u2191' : '\u2193'}</span>
                )}
              </th>
              <th
                className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)] cursor-pointer select-none hover:text-[color:var(--sf-text)]"
                onClick={toggleUpdatedSort}
              >
                Updated
                {updatedSort === null ? (
                  <span className="ml-1 opacity-40">&uarr;&darr;</span>
                ) : (
                  <span className="ml-1">{updatedSort === 'asc' ? '\u2191' : '\u2193'}</span>
                )}
              </th>
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
