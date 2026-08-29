import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mocks = {
  get_saved_theme: vi.fn(() => 'light' as 'light' | 'dark'),
  toggle_color_theme: vi.fn((t: 'light' | 'dark') => (t === 'light' ? 'dark' : 'light')),
  persist_theme_preference: vi.fn(),
  apply_dark_theme_styles: vi.fn(),
};

vi.mock('@/lib/theme', () => ({
  get_saved_theme: () => mocks.get_saved_theme(),
  toggle_color_theme: (t: 'light' | 'dark') => mocks.toggle_color_theme(t),
  persist_theme_preference: (t: 'light' | 'dark') => mocks.persist_theme_preference(t),
  apply_dark_theme_styles: (t: 'light' | 'dark') => mocks.apply_dark_theme_styles(t),
}));

import { useTheme } from '@/hooks/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get_saved_theme.mockReturnValue('light');
  });

  it('initializes from the saved theme and applies styles', () => {
    mocks.get_saved_theme.mockReturnValue('dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(mocks.apply_dark_theme_styles).toHaveBeenCalledWith('dark');
  });

  it('toggles the theme and persists the new value', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(mocks.persist_theme_preference).toHaveBeenCalledWith('dark');
    expect(mocks.apply_dark_theme_styles).toHaveBeenCalledWith('dark');
  });
});
