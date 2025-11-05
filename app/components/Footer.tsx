export default function Footer() {
  return (
    <footer className="w-full py-8 text-xs text-[color:var(--sf-text)]/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4">
        <p className="tracking-wide">© 2025 SUBZERO RESEARCH INC. ALL RIGHTS RESERVED.</p>
        <nav className="flex items-center gap-6">
          <a href="#" className="hover:opacity-80 sf-focus-ring">
            TERMS OF SERVICE
          </a>
          <a href="#" className="hover:opacity-80 sf-focus-ring">
            PRIVACY POLICY
          </a>
        </nav>
      </div>
    </footer>
  );
}


