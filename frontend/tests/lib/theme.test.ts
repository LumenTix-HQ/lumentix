import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_THEME,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  applyThemeTokens,
  getSavedTheme,
  persistThemePreference,
  toggleTheme,
} from '@/lib/theme';

function resetDocument() {
  const root = document.documentElement;
  root.removeAttribute('data-theme');
  root.classList.remove('dark');
  root.style.colorScheme = '';
}

describe('theme (#1431)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetDocument();
    vi.restoreAllMocks();
  });

  describe('persist_theme_preference / getSavedTheme', () => {
    it('round-trips the saved choice', () => {
      persistThemePreference('light');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(getSavedTheme()).toBe('light');
    });

    it('falls back to the default for missing or invalid stored values', () => {
      expect(getSavedTheme()).toBe(DEFAULT_THEME);
      localStorage.setItem(THEME_STORAGE_KEY, 'purple');
      expect(getSavedTheme()).toBe(DEFAULT_THEME);
    });

    it('never throws when storage is unavailable', () => {
      // tests/setup.ts installs an in-memory localStorage on window.
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(() => persistThemePreference('light')).not.toThrow();
      expect(getSavedTheme()).toBe(DEFAULT_THEME);
    });
  });

  describe('apply_theme_tokens', () => {
    it('selects the light token set', () => {
      applyThemeTokens('light');
      const root = document.documentElement;
      expect(root.getAttribute('data-theme')).toBe('light');
      expect(root.classList.contains('dark')).toBe(false);
      expect(root.style.colorScheme).toBe('light');
    });

    it('selects the dark token set and enables Tailwind dark: variants', () => {
      applyThemeTokens('dark');
      const root = document.documentElement;
      expect(root.getAttribute('data-theme')).toBe('dark');
      expect(root.classList.contains('dark')).toBe(true);
      expect(root.style.colorScheme).toBe('dark');
    });
  });

  describe('toggle_theme', () => {
    it('flips, persists and applies in one call', () => {
      expect(toggleTheme('dark')).toBe('light');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');

      expect(toggleTheme()).toBe('dark');
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  describe('THEME_INIT_SCRIPT (no flash before hydration)', () => {
    it('applies a saved light preference', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
      new Function(THEME_INIT_SCRIPT)();
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('applies the default theme when nothing valid is saved', () => {
      localStorage.setItem(THEME_STORAGE_KEY, 'garbage');
      new Function(THEME_INIT_SCRIPT)();
      expect(document.documentElement.getAttribute('data-theme')).toBe(DEFAULT_THEME);
    });
  });
});
