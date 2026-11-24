import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/contexts/WalletContext', () => ({ useWallet: () => ({ isConnected: false }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, logout: vi.fn() }),
}));
vi.mock('@/components/NetworkSwitcher', () => ({ NetworkSwitcher: () => null }));
vi.mock('@/components/WalletButton', () => ({ WalletButton: () => null }));
vi.mock('@/components/LocaleSwitcher', () => ({ default: () => null }));
vi.mock('@/components/MobileDrawer', () => ({ default: () => null }));

import Navbar from '@/components/Navbar';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { THEME_STORAGE_KEY } from '@/lib/theme';

// #1431: the global toggle lives in the navbar, which the root layout renders
// on every page, for both the desktop and mobile layouts.
describe('Navbar theme toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders the theme toggle for desktop and mobile layouts', () => {
    render(
      <ThemeProvider>
        <Navbar />
      </ThemeProvider>,
    );
    expect(screen.getAllByTestId('theme-toggle')).toHaveLength(2);
  });

  it('switches the whole document theme from the navbar', () => {
    render(
      <ThemeProvider>
        <Navbar />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByTestId('theme-toggle')[0]);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
