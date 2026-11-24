import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const TestComponent = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  return (
    <div>
      <span data-testid="is-loading">{String(isLoading)}</span>
      <span data-testid="is-authenticated">{String(isAuthenticated)}</span>
      <span data-testid="role">{user?.role ?? 'null'}</span>
      <button onClick={() => void logout()}>Logout</button>
    </div>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the current user via /api/proxy/auth/me rather than localStorage', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'u1', email: 'admin@example.com', role: 'admin' }),
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    expect(fetch).toHaveBeenCalledWith('/api/proxy/auth/me', { credentials: 'include' });

    await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'));
    expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
    expect(screen.getByTestId('role').textContent).toBe('admin');
  });

  it('treats a non-ok response as unauthenticated', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'));
    expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
  });

  it('treats a network failure as unauthenticated instead of throwing', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('is-loading').textContent).toBe('false'));
    expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
  });

  it('awaits the logout request before clearing the user', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    let releaseLogout!: (value: unknown) => void;

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/proxy/auth/me') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'u1', email: 'a@b.c', role: 'admin' }),
        });
      }
      // The logout request: keep it pending so we can observe the ordering.
      return new Promise((resolve) => {
        releaseLogout = resolve;
      });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true'),
    );

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    // The request is still in flight, so the user must not be cleared yet.
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByTestId('is-authenticated').textContent).toBe('true');

    await act(async () => {
      releaseLogout({ ok: true });
    });

    await waitFor(() =>
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false'),
    );
  });
});
