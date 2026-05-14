'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { DEMO_MODE_ENABLED } from '@/utils/demoMode';

type Theme = 'light' | 'dark';

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');

  const setTheme = useCallback((newTheme: Theme) => {
    if (DEMO_MODE_ENABLED) {
      setThemeState('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
      return;
    }
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  }, []);

  // Set initial theme on mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    if (DEMO_MODE_ENABLED) {
      setTheme('dark');
      return;
    }
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
