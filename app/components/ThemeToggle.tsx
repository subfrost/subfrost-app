'use client';

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-1.5"
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
    >
      <Sun
        size={14}
        className={`transition-colors ${isLight ? 'text-white' : 'text-[color:var(--sf-muted)]'}`}
      />
      <div className="relative w-8 h-4 rounded-full bg-[color:var(--sf-outline)] transition-colors">
        <div
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-[color:var(--sf-primary)] shadow-sm transition-all duration-200 ${
            isLight ? 'left-0.5' : 'left-[18px]'
          }`}
        />
      </div>
      <Moon
        size={14}
        className={`transition-colors ${!isLight ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-muted)]'}`}
      />
    </button>
  );
}
