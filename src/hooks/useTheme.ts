import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'gc_theme';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // Fallback if localStorage is inaccessible
    }
    // Explicit default requirement: Dark theme
    return 'dark';
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore
    }

    const root = document.documentElement;
    root.setAttribute('data-theme', theme);

    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
  };

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme,
  };
}
