'use client';

export default function LoadingOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center rounded-[24px] bg-gradient-to-br from-[color:var(--sf-primary)]/20 to-[color:var(--sf-primary-pressed)]/10 backdrop-blur-md animate-in fade-in duration-200">
      <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
        <Spinner />
        <div className="text-sm font-semibold text-[color:var(--sf-text)] animate-pulse">Loading balances…</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-10 w-10 animate-spin text-[color:var(--sf-primary)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Loading">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}


