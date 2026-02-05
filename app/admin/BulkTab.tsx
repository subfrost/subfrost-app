'use client';

import { useEffect, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';

export default function BulkTab() {
  const adminFetch = useAdminFetch();
  const [prefix, setPrefix] = useState('');
  const [count, setCount] = useState('10');
  const [description, setDescription] = useState('');
  const [parentCodeId, setParentCodeId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Parent code options
  const [parentCodes, setParentCodes] = useState<Array<{ id: string; code: string }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await adminFetch('/api/admin/codes?limit=100&status=active');
        if (res.ok) {
          const data = await res.json();
          setParentCodes(data.codes.map((c: { id: string; code: string }) => ({ id: c.id, code: c.code })));
        }
      } catch { /* ignore */ }
    })();
  }, [adminFetch]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError('');
    setGeneratedCodes([]);

    try {
      const res = await adminFetch('/api/admin/codes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefix: prefix.trim(),
          count: parseInt(count, 10),
          description: description.trim() || undefined,
          parentCodeId: parentCodeId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate');
      }

      const data = await res.json();
      setGeneratedCodes(data.codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(generatedCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Form */}
      <div className="w-full max-w-md rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
        <h3 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">Bulk Generate</h3>
        <form onSubmit={handleGenerate} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Prefix *</label>
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
              placeholder="CAMPAIGN"
              required
            />
            <div className="mt-1 text-xs text-[color:var(--sf-muted)]">
              Codes will be: {prefix || 'PREFIX'}-XXXXX
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Count *</label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              min="1"
              max="500"
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
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
              placeholder="Feb 2026 Twitter giveaway"
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

          {error && <div className="text-sm text-red-400">{error}</div>}

          <button
            type="submit"
            disabled={generating || !prefix.trim() || !count}
            className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {generating ? 'Generating...' : `Generate ${count} Codes`}
          </button>
        </form>
      </div>

      {/* Results */}
      {generatedCodes.length > 0 && (
        <div className="flex-1 rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[color:var(--sf-text)]">
              Generated {generatedCodes.length} Codes
            </h3>
            <button
              onClick={handleCopyAll}
              className="rounded-lg border border-[color:var(--sf-outline)] px-3 py-1 text-xs text-[color:var(--sf-text)] hover:bg-[color:var(--sf-glass-bg)]"
            >
              {copied ? 'Copied!' : 'Copy All'}
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg bg-black/20 p-3">
            {generatedCodes.map((code) => (
              <div key={code} className="font-mono text-xs text-[color:var(--sf-text)]">
                {code}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
