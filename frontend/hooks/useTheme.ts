'use client';
import { useState, useEffect } from 'react';
import { Theme, toggle_color_theme, persist_theme_preference, apply_dark_theme_styles, get_saved_theme } from '../lib/theme';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const saved = get_saved_theme();
    setTheme(saved);
    apply_dark_theme_styles(saved);
  }, []);

  const toggleTheme = () => {
    const next = toggle_color_theme(theme);
    setTheme(next);
    persist_theme_preference(next);
    apply_dark_theme_styles(next);
  };

  return { theme, toggleTheme };
}
