'use client';

import { useState } from 'react';
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
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Parent Code</label>
            <select
              value={parentCodeId}
              onChange={(e) => setParentCodeId(e.target.value)}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
            >
              <option value="">None (top-level)</option>
              {parentCodes.map((p) => (
                <option key={p.id} value={p.id}>{p.code}</option>
              ))}
            </select>
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
