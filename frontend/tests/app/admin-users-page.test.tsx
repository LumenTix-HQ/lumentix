import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGet = vi.fn();
const apiPatch = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiGet, apiPatch }));
vi.mock('@/components/AdminNav', () => ({ default: () => <nav data-testid="admin-nav" /> }));

import AdminUsersPage from '@/app/admin/users/page';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  stellarPublicKey: string | null;
  createdAt: string;
}

const makeUser = (overrides: Partial<AdminUser> = {}): AdminUser => ({
  id: 'u1',
  email: 'alice@example.com',
  displayName: 'Alice',
  role: 'EVENT_GOER',
  status: 'active',
  stellarPublicKey: null,
  createdAt: '2025-01-01T00:00:00Z',
  ...overrides,
});

const pageFixture = (data: AdminUser[]) => ({
  data,
  total: data.length,
  page: 1,
  lastPage: data.length > 0 ? 1 : 0,
  hasNextPage: false,
  hasPreviousPage: false,
});

beforeEach(() => {
  apiGet.mockReset();
  apiPatch.mockReset();
  apiGet.mockResolvedValue(pageFixture([makeUser()]));
});

describe('AdminUsersPage', () => {
  it('lists users from the paginated admin endpoint', async () => {
    render(<AdminUsersPage />);
    expect(await screen.findByText('alice@example.com')).toBeTruthy();
    expect(apiGet).toHaveBeenCalledWith('/admin/users?limit=25&page=1');
  });

  it('searches with a debounced query', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('alice@example.com');
    apiGet.mockClear();
    fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'bob' } });
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('search=bob')),
    );
  });

  it('filters by role and status', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('alice@example.com');
    apiGet.mockClear();
    fireEvent.change(screen.getByLabelText('Filter by role'), { target: { value: 'ORGANIZER' } });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'blocked' } });
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('role=ORGANIZER')));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('status=blocked')));
  });

  it('suspends an active account via the block endpoint', async () => {
    render(<AdminUsersPage />);
    await screen.findByText('alice@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/admin/users/u1/block'));
    expect(await screen.findByText('Suspended')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeTruthy();
  });

  it('reactivates a suspended account via the unblock endpoint', async () => {
    apiGet.mockResolvedValue(pageFixture([makeUser({ id: 'u2', email: 'bob@example.com', status: 'blocked' })]));
    render(<AdminUsersPage />);
    await screen.findByText('bob@example.com');
    expect(screen.getByText('Suspended')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledWith('/admin/users/u2/unblock'));
    expect(await screen.findByText('Active')).toBeTruthy();
  });
});