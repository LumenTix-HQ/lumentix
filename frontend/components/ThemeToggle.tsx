'use client';
import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} mode`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${next} mode`}
      className="p-2 rounded-lg text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)] transition-colors"
      data-testid="theme-toggle"
    >
      <span aria-hidden="true">{theme === 'light' ? '🌙' : '☀️'}</span>
    </button>
  );
}
