'use client';

import { Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`text-base font-bold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
        isLight ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-muted)]'
      }`}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      <Sun size={16} strokeWidth={2.5} />
    </button>
  );
}
