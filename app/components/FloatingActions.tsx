export default function FloatingActions() {
  const btn =
    "flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[color:var(--sf-text)] shadow border border-[color:var(--sf-outline)] backdrop-blur hover:bg-white transition-colors sf-focus-ring";
  return (
    <div className="fixed bottom-6 right-6 z-50 hidden flex-col space-y-3 md:flex">
      <button aria-label="Wallet" className={btn}>
        {/* Wallet icon (inline SVG) */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 7H3a2 2 0 0 1 0-4h14a2 2 0 0 1 0 4h4v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7h20Zm-4-4H3a1 1 0 0 0 0 2h14a1 1 0 0 0 0-2Zm4 8h-4a2 2 0 1 0 0 4h4v-4Z"/>
        </svg>
      </button>
      <a aria-label="X" className={btn} href="#">
        {/* X/Twitter icon */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.3 3H21l-7 8.1L22 21h-6.8l-5.3-6.5-6 6.5H3l7.5-8.2L2 3h6.9l4.8 5.8L18.3 3Z"/>
        </svg>
      </a>
      <a aria-label="GitHub" className={btn} href="#">
        {/* GitHub icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M12 .5a12 12 0 0 0-3.79 23.4c.6.11.82-.26.82-.58v-2.1c-3.34.73-4.04-1.44-4.04-1.44-.55-1.4-1.35-1.77-1.35-1.77-1.1-.76.08-.75.08-.75 1.22.09 1.86 1.26 1.86 1.26 1.08 1.86 2.83 1.33 3.52 1.02.11-.78.43-1.33.78-1.64-2.66-.3-5.46-1.33-5.46-5.92 0-1.31.47-2.37 1.25-3.21-.13-.3-.54-1.52.12-3.17 0 0 1.02-.33 3.34 1.23a11.6 11.6 0 0 1 6.08 0c2.32-1.56 3.33-1.23 3.33-1.23.66 1.65.25 2.87.12 3.17.78.84 1.25 1.9 1.25 3.21 0 4.6-2.8 5.61-5.47 5.9.44.39.83 1.16.83 2.35v3.49c0 .32.21.7.83.58A12 12 0 0 0 12 .5Z" clipRule="evenodd"/>
        </svg>
      </a>
    </div>
  );
}


