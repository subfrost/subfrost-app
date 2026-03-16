'use client';

import { useState, useRef, useEffect } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  parentCodes?: Array<{ id: string; code: string }>;
}

export default function CreateCodeModal({ onClose, onCreated, parentCodes = [] }: Props) {
  const adminFetch = useAdminFetch();
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [parentCodeId, setParentCodeId] = useState('');
  const [ownerTaprootAddress, setOwnerTaprootAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [parentDropdownOpen, setParentDropdownOpen] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (parentRef.current && !parentRef.current.contains(e.target as Node)) {
        setParentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredParentCodes = parentCodes.filter((p) =>
    p.code.toLowerCase().includes(parentSearch.toLowerCase())
  );
  const selectedParentCode = parentCodes.find((p) => p.id === parentCodeId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await adminFetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          description: description.trim() || undefined,
          parentCodeId: parentCodeId || undefined,
          ownerTaprootAddress: ownerTaprootAddress.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create code');
      }

      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
        <h2 className="mb-4 text-lg font-bold text-[color:var(--sf-text)]">Create Invite Code</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Code *</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
              placeholder="MYCODE123"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
              placeholder="Twitter campaign Jan 2026"
            />
          </div>
          <div ref={parentRef} className="relative">
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Parent Code</label>
            <input
              type="text"
              value={parentDropdownOpen ? parentSearch : (selectedParentCode?.code || '')}
              onChange={(e) => {
                setParentSearch(e.target.value);
                setParentDropdownOpen(true);
              }}
              onFocus={() => {
                setParentSearch('');
                setParentDropdownOpen(true);
              }}
              placeholder="None (top-level)"
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
            />
            {parentDropdownOpen && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] shadow-lg">
                <button
                  type="button"
                  onClick={() => { setParentCodeId(''); setParentSearch(''); setParentDropdownOpen(false); }}
                  className="w-full px-3 py-2 text-left text-sm text-[color:var(--sf-muted)] hover:bg-[color:var(--sf-glass-bg)]"
                >
                  None (top-level)
                </button>
                {filteredParentCodes.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => { setParentCodeId(p.id); setParentSearch(''); setParentDropdownOpen(false); }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--sf-glass-bg)] ${p.id === parentCodeId ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]'}`}
                  >
                    {p.code}
                  </button>
                ))}
                {filteredParentCodes.length === 0 && parentSearch && (
                  <div className="px-3 py-2 text-sm text-[color:var(--sf-muted)]">No codes found</div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">
              Owner Taproot Address
            </label>
            <input
              type="text"
              value={ownerTaprootAddress}
              onChange={(e) => setOwnerTaprootAddress(e.target.value)}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)] font-mono"
              placeholder="bc1p..."
            />
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !code.trim()}
              className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
