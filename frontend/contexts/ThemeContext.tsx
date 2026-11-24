'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  Theme,
  applyThemeTokens,
  getSavedTheme,
  isTheme,
  toggleTheme as toggleStoredTheme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Single source of truth for the active theme, so every toggle on the page
 * shows the same state. Also follows changes made in other tabs.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline init script has already applied the saved theme to <html>;
  // React state starts at the default and syncs on mount to avoid a
  // server/client mismatch.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    const saved = getSavedTheme();
    setThemeState(saved);
    applyThemeTokens(saved);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = isTheme(event.newValue) ? event.newValue : DEFAULT_THEME;
      setThemeState(next);
      applyThemeTokens(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => toggleStoredTheme(current));
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState((current) => (current === next ? current : toggleStoredTheme(current)));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue | null {
  return useContext(ThemeContext);
}
