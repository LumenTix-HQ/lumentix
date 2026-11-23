import { apiGet, apiPatch } from './api-client';

export type AdminRole = 'EVENT_GOER' | 'ORGANIZER' | 'SPONSOR' | 'ADMIN';
export type AdminStatus = 'active' | 'blocked';

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: AdminRole;
  status: AdminStatus;
  stellarPublicKey: string | null;
  createdAt: string;
}

export interface AdminUserPage {
  data: AdminUser[];
  total: number;
  page: number;
  lastPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ListAdminUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

/**
 * search_users — searches and filters users with pagination.
 */
export async function search_users(query: ListAdminUsersQuery = {}): Promise<AdminUserPage> {
  const params = new URLSearchParams();
  if (query.limit) params.set('limit', String(query.limit));
  if (query.page) params.set('page', String(query.page));
  if (query.search?.trim()) params.set('search', query.search.trim());
  if (query.role) params.set('role', query.role);
  if (query.status) params.set('status', query.status);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiGet<AdminUserPage>(`/admin/users${qs}`);
}

/**
 * update_user_role — updates a user's role.
 */
export async function update_user_role(userId: string, role: AdminRole | string): Promise<AdminUser> {
  return apiPatch<AdminUser>(`/admin/users/${userId}`, { role });
}

/**
 * suspend_user_account — suspends (blocks) a user account.
 */
export async function suspend_user_account(userId: string): Promise<AdminUser> {
  return apiPatch<AdminUser>(`/admin/users/${userId}/block`);
}

/**
 * reactivate_user_account — reactivates (unblocks) a user account.
 */
export async function reactivate_user_account(userId: string): Promise<AdminUser> {
  return apiPatch<AdminUser>(`/admin/users/${userId}/unblock`);
}

// CamelCase aliases
export const searchUsers = search_users;
export const updateUserRole = update_user_role;
export const suspendUserAccount = suspend_user_account;
export const reactivateUserAccount = reactivate_user_account;
