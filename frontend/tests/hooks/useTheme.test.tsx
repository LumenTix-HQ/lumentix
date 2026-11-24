import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = {
  getSavedTheme: vi.fn(() => 'light' as 'light' | 'dark'),
  toggleColorTheme: vi.fn((t: 'light' | 'dark') => (t === 'light' ? 'dark' : 'light')),
  persistThemePreference: vi.fn(),
  applyThemeTokens: vi.fn(),
};

vi.mock('@/lib/theme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/theme')>()),
  getSavedTheme: () => mocks.getSavedTheme(),
  toggleColorTheme: (t: 'light' | 'dark') => mocks.toggleColorTheme(t),
  persistThemePreference: (t: 'light' | 'dark') => mocks.persistThemePreference(t),
  applyThemeTokens: (t: 'light' | 'dark') => mocks.applyThemeTokens(t),
}));

import { useTheme } from '@/hooks/useTheme';

describe('useTheme (outside ThemeProvider)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSavedTheme.mockReturnValue('light');
  });

  it('initializes from the saved theme and applies its tokens', () => {
    mocks.getSavedTheme.mockReturnValue('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(mocks.applyThemeTokens).toHaveBeenCalledWith('dark');
  });

  it('toggles the theme and persists the new value', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(mocks.persistThemePreference).toHaveBeenCalledWith('dark');
    expect(mocks.applyThemeTokens).toHaveBeenCalledWith('dark');
  });
});
