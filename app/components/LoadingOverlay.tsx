'use client';

export default function LoadingOverlay() {
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center rounded-[22px] bg-black/30 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <Spinner />
        <div className="text-xs text-white/80">Loading balances…</div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-8 w-8 animate-spin text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Loading">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}


