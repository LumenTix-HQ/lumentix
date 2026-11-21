import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  search_users,
  update_user_role,
  suspend_user_account,
  reactivate_user_account,
} from '@/lib/admin';

const { apiGet, apiPatch } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiGet,
  apiPatch,
}));

describe('admin lib functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search_users', () => {
    it('calls apiGet with constructed query parameters', async () => {
      const mockResult = {
        data: [],
        total: 0,
        page: 1,
        lastPage: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };
      apiGet.mockResolvedValueOnce(mockResult);

      const result = await search_users({
        limit: 25,
        page: 2,
        search: 'john',
        role: 'ORGANIZER',
        status: 'active',
      });

      expect(apiGet).toHaveBeenCalledWith(
        '/admin/users?limit=25&page=2&search=john&role=ORGANIZER&status=active',
      );
      expect(result).toBe(mockResult);
    });

    it('works without parameters', async () => {
      apiGet.mockResolvedValueOnce({ data: [] });
      await search_users();
      expect(apiGet).toHaveBeenCalledWith('/admin/users');
    });
  });

  describe('update_user_role', () => {
    it('calls apiPatch with user role payload', async () => {
      const updatedUser = { id: 'u1', role: 'ADMIN' };
      apiPatch.mockResolvedValueOnce(updatedUser);

      const result = await update_user_role('u1', 'ADMIN');
      expect(apiPatch).toHaveBeenCalledWith('/admin/users/u1', { role: 'ADMIN' });
      expect(result).toEqual(updatedUser);
    });
  });

  describe('suspend_user_account', () => {
    it('calls apiPatch on block endpoint', async () => {
      const blockedUser = { id: 'u1', status: 'blocked' };
      apiPatch.mockResolvedValueOnce(blockedUser);

      const result = await suspend_user_account('u1');
      expect(apiPatch).toHaveBeenCalledWith('/admin/users/u1/block');
      expect(result).toEqual(blockedUser);
    });
  });

  describe('reactivate_user_account', () => {
    it('calls apiPatch on unblock endpoint', async () => {
      const activeUser = { id: 'u1', status: 'active' };
      apiPatch.mockResolvedValueOnce(activeUser);

      const result = await reactivate_user_account('u1');
      expect(apiPatch).toHaveBeenCalledWith('/admin/users/u1/unblock');
      expect(result).toEqual(activeUser);
    });
  });
});
