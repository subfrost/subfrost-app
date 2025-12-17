'use client';

export default function ChartPlaceholder() {
  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-primary)]/5 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold text-[color:var(--sf-text)]">Market chart</h3>
        <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/60">
          Coming soon
        </span>
      </div>
      <div className="h-40 w-full rounded-lg bg-[color:var(--sf-primary)]/5" />
    </div>
  );
}


