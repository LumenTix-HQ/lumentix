import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const useAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

vi.mock('@/components/AuditLogViewer', () => ({
  AuditLogViewer: () => <div>audit logs</div>,
}));

import AuditLogPage from '@/app/organizer/audit/page';

describe('Organizer audit trail page auth gating', () => {
  beforeEach(() => {
    replace.mockClear();
    useAuth.mockReset();
  });

  it('renders nothing while the session is still loading', () => {
    useAuth.mockReturnValue({ user: null, isLoading: true });
    const { container } = render(<AuditLogPage />);
    expect(container).toBeEmptyDOMElement();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /login when unauthenticated', async () => {
    useAuth.mockReturnValue({ user: null, isLoading: false });
    render(<AuditLogPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('redirects home when the user is neither organizer nor admin', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1', email: 'u1@example.com', role: 'user' }, isLoading: false });
    render(<AuditLogPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
  });

  it('renders the audit log viewer for an authenticated organizer', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1', email: 'org@example.com', role: 'organizer' }, isLoading: false });
    const { findByText } = render(<AuditLogPage />);
    expect(await findByText('audit logs')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the audit log viewer for an authenticated admin', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1', email: 'admin@example.com', role: 'admin' }, isLoading: false });
    const { findByText } = render(<AuditLogPage />);
    expect(await findByText('audit logs')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
