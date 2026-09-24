'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api-client';
import AdminNav from '@/components/AdminNav';

type AdminRole = 'EVENT_GOER' | 'ORGANIZER' | 'SPONSOR' | 'ADMIN';
type AdminStatus = 'active' | 'blocked';

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  role: AdminRole;
  status: AdminStatus;
  stellarPublicKey: string | null;
  createdAt: string;
}

interface AdminUserPage {
  data: AdminUser[];
  total: number;
  page: number;
  lastPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const ROLE_LABELS: Record<AdminRole, string> = {
  EVENT_GOER: 'Event Goer',
  ORGANIZER: 'Organizer',
  SPONSOR: 'Sponsor',
  ADMIN: 'Admin',
};

const ROLE_STYLES: Record<AdminRole, string> = {
  ADMIN: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
  ORGANIZER: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  SPONSOR: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
  EVENT_GOER: 'bg-gray-500/20 text-gray-300 border border-gray-500/30',
};

const PAGE_SIZE = 25;

const selectClass =
  'bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white';

const filterInputClass =
  'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-500';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRole>('EVENT_GOER');
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const firstRender = useRef(true);

  const fetchUsers = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<AdminUserPage>(`/admin/users${query}`);
      setUsers(data.data ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setLastPage(data.lastPage ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      void fetchUsers(`?limit=${PAGE_SIZE}&page=1`);
      return;
    }
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (search.trim()) params.set('search', search.trim());
    if (roleFilter) params.set('role', roleFilter);
    if (statusFilter) params.set('status', statusFilter);
    const timer = window.setTimeout(() => void fetchUsers(`?${params.toString()}`), 200);
    return () => window.clearTimeout(timer);
  }, [search, roleFilter, statusFilter, page, fetchUsers]);

  const handleRoleSave = async (userId: string) => {
    try {
      await apiPatch(`/admin/users/${userId}`, { role: selectedRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: selectedRole } : u)),
      );
      setEditingRoleId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    }
  };

  const toggleSuspend = async (user: AdminUser) => {
    const action = user.status === 'blocked' ? 'unblock' : 'block';
    try {
      await apiPatch(`/admin/users/${user.id}/${action}`);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, status: action === 'block' ? 'blocked' : 'active' } : u,
        ),
      );
      setActionUser(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update account status');
    }
  };

  return (
    <main className="min-h-screen bg-[#060609] text-white pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <AdminNav />
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
            User Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Search, filter, and manage user accounts — role assignment and account suspension.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by email or name…"
            aria-label="Search users"
            className={`${filterInputClass} min-w-[240px]`}
          />
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
            className={selectClass}
          >
            <option value="">All roles</option>
            <option value="EVENT_GOER">Event Goer</option>
            <option value="ORGANIZER">Organizer</option>
            <option value="SPONSOR">Sponsor</option>
            <option value="ADMIN">Admin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
            className={selectClass}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="blocked">Suspended</option>
          </select>
          <span className="text-xs text-gray-500">
            {total} user{total === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Joined</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {user.displayName || 'Unnamed'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {editingRoleId === user.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedRole}
                              onChange={(e) => setSelectedRole(e.target.value as AdminRole)}
                              aria-label={`Role for ${user.email}`}
                              className={selectClass}
                            >
                              {(Object.keys(ROLE_LABELS) as AdminRole[]).map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleRoleSave(user.id)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRoleId(null)}
                              className="text-xs text-gray-500 hover:text-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLES[user.role]}`}
                          >
                            {ROLE_LABELS[user.role] ?? user.role}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.status === 'blocked'
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-green-500/20 text-green-300 border border-green-500/30'
                          }`}
                        >
                          {user.status === 'blocked' ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                        <button
                          onClick={() => {
                            setEditingRoleId(user.id);
                            setSelectedRole(user.role);
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Edit Role
                        </button>
                        {actionUser?.id === user.id ? (
                          <span className="space-x-2">
                            <button
                              onClick={() => void toggleSuspend(user)}
                              className={`text-xs ${user.status === 'blocked' ? 'text-green-400' : 'text-red-400'} hover:opacity-80`}
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setActionUser(null)}
                              className="text-xs text-gray-500 hover:text-gray-400"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setActionUser(user)}
                            className={`text-xs ${
                              user.status === 'blocked'
                                ? 'text-green-400 hover:text-green-300'
                                : 'text-red-400 hover:text-red-300'
                            }`}
                          >
                            {user.status === 'blocked' ? 'Reactivate' : 'Suspend'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {users.length === 0 && (
              <div className="text-center py-16 text-gray-500">No users found.</div>
            )}
          </div>
        )}

        {/* Pagination */}
        {lastPage > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm text-gray-400">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!page || page <= 1}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 disabled:opacity-40 hover:bg-white/10 transition"
            >
              Previous
            </button>
            <span>
              Page {page} of {lastPage}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={!page || page >= lastPage}
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 disabled:opacity-40 hover:bg-white/10 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}