export default function Footer() {
  return (
    <footer className="w-full py-2 text-xs text-[color:var(--sf-text)]/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
        <p className="tracking-wide">© 2025 SUBZERO RESEARCH INC. ALL RIGHTS RESERVED.</p>
        <nav className="flex items-center gap-6">
          <a href="#" className="hover:opacity-80 focus:outline-none">
            TERMS OF SERVICE
          </a>
          <a href="#" className="hover:opacity-80 focus:outline-none">
            PRIVACY POLICY
          </a>
          <a 
            href="https://x.com/SUBFROSTio" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:opacity-80 focus:outline-none flex items-center"
            aria-label="X (Twitter)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.3 3H21l-7 8.1L22 21h-6.8l-5.3-6.5-6 6.5H3l7.5-8.2L2 3h6.9l4.8 5.8L18.3 3Z"/>
            </svg>
          </a>
          <a 
            href="https://github.com/subfrost" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:opacity-80 focus:outline-none flex items-center"
            aria-label="GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </nav>
      </div>
    </footer>
  );
}


