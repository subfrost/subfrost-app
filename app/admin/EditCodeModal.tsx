'use client';

import { useState } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface CodeData {
  id: string;
  code: string;
  description: string | null;
  isActive: boolean;
  ownerTaprootAddress: string | null;
}

interface Props {
  code: CodeData;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditCodeModal({ code, onClose, onUpdated }: Props) {
  const adminFetch = useAdminFetch();
  const [description, setDescription] = useState(code.description || '');
  const [isActive, setIsActive] = useState(code.isActive);
  const [ownerTaprootAddress, setOwnerTaprootAddress] = useState(code.ownerTaprootAddress || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const res = await adminFetch(`/api/admin/codes/${code.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim() || null,
          isActive,
          ownerTaprootAddress: ownerTaprootAddress.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update code');
      }

      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)] p-6">
        <h2 className="mb-4 text-lg font-bold text-[color:var(--sf-text)]">
          Edit: {code.code}
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
            />
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
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-[color:var(--sf-muted)]">Status</label>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isActive
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}
            >
              {isActive ? 'Active' : 'Inactive'}
            </button>
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
              disabled={saving}
              className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
