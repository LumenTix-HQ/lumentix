import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
let redirectParam: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => ({ get: (key: string) => (key === 'redirect' ? redirectParam : null) }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import LoginPage from '@/app/login/page';

const mockFetch = vi.fn();

async function submit() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('emailAddress'), 'user@example.com');
  await user.type(screen.getByLabelText('password'), 'password123');
  await user.click(screen.getByRole('button', { name: 'signIn' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    push.mockClear();
    mockFetch.mockReset();
    redirectParam = null;
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('signs in through POST /api/auth/login and redirects to /events by default', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    render(<LoginPage />);

    await submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/events'));
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      }),
    );
    expect(document.cookie).not.toContain('access_token');
  });

  it('honours a relative redirect parameter', async () => {
    redirectParam = '/organizer/dashboard';
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    render(<LoginPage />);

    await submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/organizer/dashboard'));
  });

  it('ignores an absolute or protocol-relative redirect parameter', async () => {
    redirectParam = '//evil.example.com';
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    render(<LoginPage />);

    await submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/events'));
  });

  it('shows an error message on 401 and does not navigate', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    render(<LoginPage />);

    await submit();

    expect(await screen.findByText('Invalid email or password credentials')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
