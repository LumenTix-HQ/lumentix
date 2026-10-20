'use client';
import { useState, useEffect } from 'react';
import { Theme, toggleColorTheme, persistThemePreference, applyThemeTokens, getSavedTheme } from '../lib/theme';
import { useThemeContext } from '../contexts/ThemeContext';

/**
 * Active theme and a toggle. Inside <ThemeProvider> (the app root) this reads
 * the shared state; outside it (isolated component tests) it manages its own.
 */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const context = useThemeContext();
  const [localTheme, setLocalTheme] = useState<Theme>(() => getSavedTheme());

  useEffect(() => {
    if (context) return;
    const saved = getSavedTheme();
    setLocalTheme(saved);
    applyThemeTokens(saved);
  }, [context]);

  if (context) {
    return { theme: context.theme, toggleTheme: context.toggleTheme };
  }

  const toggleTheme = () => {
    const next = toggleColorTheme(localTheme);
    setLocalTheme(next);
    persistThemePreference(next);
    applyThemeTokens(next);
  };

  return { theme: localTheme, toggleTheme };
}
