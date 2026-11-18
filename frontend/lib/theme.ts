import themeInit from './theme-init.json';

export type Theme = 'light' | 'dark';

/** localStorage key holding the user's explicit choice. */
export const THEME_STORAGE_KEY: string = themeInit.storageKey;

/**
 * Theme used when the user has never chosen one. Lumentix was designed dark,
 * so dark stays the default; light is opt-in.
 */
export const DEFAULT_THEME: Theme = themeInit.defaultTheme as Theme;

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function toggleColorTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}

/** The saved preference, or DEFAULT_THEME if none (or an unreadable/invalid value). */
export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : DEFAULT_THEME;
  } catch {
    // Storage can be blocked (privacy mode, embedded iframes).
    return DEFAULT_THEME;
  }
}

/** Remembers the user's choice across visits. Never throws. */
export function persistThemePreference(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The theme still applies for this visit; it just won't be remembered.
  }
}

/**
 * Switches the document to a theme's colour tokens. The token values live in
 * app/globals.css under `html[data-theme='light' | 'dark']`, so this only
 * selects the set; `.dark` keeps Tailwind `dark:` variants in step.
 */
export function applyThemeTokens(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

/** @deprecated use applyThemeTokens */
export function applyDarkThemeStyles(theme: Theme): void {
  applyThemeTokens(theme);
}

/** Flips the theme, remembers it, applies it, and returns the new theme. */
export function toggleTheme(current?: Theme): Theme {
  const next = toggleColorTheme(current ?? getSavedTheme());
  persistThemePreference(next);
  applyThemeTokens(next);
  return next;
}

/**
 * Inline script for <head>: applies the saved theme before first paint so a
 * light-mode user never sees a flash of the dark theme during hydration.
 * Mirrors getSavedTheme/applyThemeTokens without depending on the bundle.
 *
 * The script text lives in lib/theme-init.json so next.config.base.js can hash
 * the exact same bytes for the Content-Security-Policy script-src directive.
 */
export const THEME_INIT_SCRIPT: string = themeInit.script;
