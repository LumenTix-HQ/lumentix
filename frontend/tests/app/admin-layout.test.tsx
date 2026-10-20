import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const useAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

import AdminLayout from '@/app/admin/layout';

describe('AdminLayout auth gating', () => {
  beforeEach(() => {
    push.mockClear();
    useAuth.mockReset();
  });

  it('renders nothing while the session is still loading', () => {
    useAuth.mockReturnValue({ user: null, isLoading: true });
    const { container } = render(<AdminLayout><div>secret</div></AdminLayout>);
    expect(container).toBeEmptyDOMElement();
    expect(push).not.toHaveBeenCalled();
  });

  it('redirects to login when unauthenticated', async () => {
    useAuth.mockReturnValue({ user: null, isLoading: false });
    render(<AdminLayout><div>secret</div></AdminLayout>);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/login?redirect=/admin/users'));
  });

  it('redirects to home when the role is not admin', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1', email: 'u1@example.com', role: 'user' }, isLoading: false });
    render(<AdminLayout><div>secret</div></AdminLayout>);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
  });

  it('renders children for an authenticated admin user', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1', email: 'admin@example.com', role: 'admin' }, isLoading: false });
    const { findByText } = render(<AdminLayout><div>secret</div></AdminLayout>);
    expect(await findByText('secret')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
