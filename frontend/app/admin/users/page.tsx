'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiDelete } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: 'user' | 'organizer' | 'admin';
  createdAt: string;
  isActive: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<User[]>('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleEdit = (user: User) => {
    setEditingRole(user.id);
    setSelectedRole(user.role);
  };

  const handleRoleSave = async (userId: string) => {
    try {
      await apiPatch(`/admin/users/${userId}`, { role: selectedRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: selectedRole as User['role'] } : u))
      );
      setEditingRole(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await apiDelete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user');
    }
  };

  return (
    <main className="min-h-screen bg-[#060609] text-white pt-24 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
            User Management
          </h1>
          <p className="text-gray-500 text-sm mt-1">Manage registered users, roles, and account status.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

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
                        {editingRole === user.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedRole}
                              onChange={(e) => setSelectedRole(e.target.value)}
                              className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white"
                            >
                              <option value="user">user</option>
                              <option value="organizer">organizer</option>
                              <option value="admin">admin</option>
                            </select>
                            <button
                              onClick={() => handleRoleSave(user.id)}
                              className="text-xs text-blue-400 hover:text-blue-300"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingRole(null)}
                              className="text-xs text-gray-500 hover:text-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : user.role === 'organizer'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                          }`}>
                            {user.role}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                        <button
                          onClick={() => handleRoleEdit(user)}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Edit Role
                        </button>
                        {deleteConfirm === user.id ? (
                          <span className="space-x-2">
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="text-xs text-red-400 hover:text-red-300"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="text-xs text-gray-500 hover:text-gray-400"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Delete
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
      </div>
    </main>
  );
}
