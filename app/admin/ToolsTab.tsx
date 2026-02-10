'use client';

import { useState } from 'react';

export default function ToolsTab() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{
    valid?: boolean;
    error?: string;
    elapsed?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setResult(null);
    const start = performance.now();

    try {
      const res = await fetch('/api/invite-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - start);
      setResult({ valid: data.valid, error: data.error, elapsed });
    } catch (err) {
      const elapsed = Math.round(performance.now() - start);
      setResult({ valid: false, error: `Network error: ${err}`, elapsed });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6">
        <h3 className="mb-4 text-lg font-semibold text-[color:var(--sf-text)]">Verify Invite Code</h3>
        <form onSubmit={handleVerify} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Invite Code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SUBFROST"
              className="h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)]/50"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="h-10 rounded-lg bg-[color:var(--sf-primary)] px-5 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        {result && (
          <div className={`mt-4 rounded-lg border p-4 ${
            result.valid
              ? 'border-green-500/30 bg-green-500/10'
              : 'border-red-500/30 bg-red-500/10'
          }`}>
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${result.valid ? 'text-green-400' : 'text-red-400'}`}>
                {result.valid ? 'Valid' : 'Invalid'}{result.error ? ` — ${result.error}` : ''}
              </span>
              <span className="text-xs text-[color:var(--sf-muted)]">
                {result.elapsed}ms
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
