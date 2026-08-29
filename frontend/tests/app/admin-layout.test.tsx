import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import AdminLayout from '@/app/admin/layout';

function makeToken(payload: Record<string, unknown>): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `header.${b64}.sig`;
}

const getItem = vi.fn();

describe('AdminLayout auth gating', () => {
  beforeEach(() => {
    push.mockClear();
    getItem.mockReset();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: { getItem, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn() },
    });
  });

  it('redirects to login when unauthenticated', async () => {
    getItem.mockReturnValue(null);
    render(<AdminLayout><div>secret</div></AdminLayout>);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?redirect=/admin/users'));
  });

  it('redirects to home when the role is not admin', async () => {
    getItem.mockReturnValue(makeToken({ sub: 'u1', role: 'user' }));
    render(<AdminLayout><div>secret</div></AdminLayout>);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('renders children for an admin token', async () => {
    getItem.mockReturnValue(makeToken({ sub: 'u1', role: 'admin' }));
    const { findByText } = render(<AdminLayout><div>secret</div></AdminLayout>);
    expect(await findByText('secret')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
