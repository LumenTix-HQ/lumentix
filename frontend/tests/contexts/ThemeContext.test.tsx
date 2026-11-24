import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ThemeToggle from '@/components/ThemeToggle';
import { THEME_STORAGE_KEY } from '@/lib/theme';

function renderTwoToggles() {
  return render(
    <ThemeProvider>
      <div data-testid="desktop"><ThemeToggle /></div>
      <div data-testid="mobile"><ThemeToggle /></div>
    </ThemeProvider>,
  );
}

describe('ThemeProvider + ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  it('starts from the saved preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    renderTwoToggles();
    expect(screen.getAllByTestId('theme-toggle')[0]).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('keeps every toggle in sync and persists the choice', () => {
    renderTwoToggles();
    const [desktop, mobile] = screen.getAllByTestId('theme-toggle');
    expect(desktop).toHaveAttribute('aria-label', 'Switch to light mode');

    fireEvent.click(desktop);

    expect(mobile).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('follows a theme change made in another tab', () => {
    renderTwoToggles();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'light' }));
    });
    expect(screen.getAllByTestId('theme-toggle')[0]).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
