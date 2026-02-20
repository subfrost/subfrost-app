'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAdminFetch } from './useAdminFetch';
import { PERMISSION_GROUPS, PERMISSION_LABELS, type AdminPermission } from '@/lib/admin-permissions';

interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  isActive: boolean;
  permissions: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export default function UsersTab() {
  const adminFetch = useAdminFetch();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPermissions, setNewPermissions] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/iam/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [adminFetch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await adminFetch('/api/admin/iam/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || undefined,
          permissions: newPermissions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create user');
      }
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      setNewPermissions([]);
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEditPermissions([...user.permissions]);
    setEditDisplayName(user.displayName || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/iam/users/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName || null,
          permissions: editPermissions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update');
      }
      setEditingId(null);
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user: AdminUser) => {
    try {
      const res = await adminFetch(`/api/admin/iam/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to toggle');
      }
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const deleteUser = async (user: AdminUser) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      const res = await adminFetch(`/api/admin/iam/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const PermissionCheckboxes = ({
    selected,
    onChange,
  }: {
    selected: string[];
    onChange: (perms: string[]) => void;
  }) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label} className="rounded-lg border border-[color:var(--sf-outline)] p-3">
          <div className="mb-2 text-xs font-semibold text-[color:var(--sf-muted)]">{group.label}</div>
          {group.permissions.map((perm) => (
            <label key={perm} className="flex items-center gap-2 py-0.5 text-xs text-[color:var(--sf-text)]">
              <input
                type="checkbox"
                checked={selected.includes(perm)}
                onChange={(e) => {
                  if (e.target.checked) onChange([...selected, perm]);
                  else onChange(selected.filter((p) => p !== perm));
                }}
                className="rounded"
              />
              {PERMISSION_LABELS[perm as AdminPermission] || perm}
            </label>
          ))}
        </div>
      ))}
    </div>
  );

  if (loading) return <div className="text-[color:var(--sf-muted)]">Loading...</div>;

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--sf-text)]">
          Admin Users ({users.length})
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-[color:var(--sf-primary)] px-3 py-1.5 text-xs text-white hover:opacity-90"
        >
          {showCreate ? 'Cancel' : 'Create User'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6"
        >
          <h4 className="mb-4 text-sm font-semibold text-[color:var(--sf-text)]">New Admin User</h4>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Username</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                required
                minLength={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[color:var(--sf-muted)]">Display Name</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className="h-9 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-3 text-sm text-[color:var(--sf-text)]"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-2 block text-xs text-[color:var(--sf-muted)]">Permissions</label>
            <PermissionCheckboxes selected={newPermissions} onChange={setNewPermissions} />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-[color:var(--sf-primary)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create User'}
          </button>
        </form>
      )}

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--sf-glass-border)]">
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Username</th>
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Display Name</th>
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Status</th>
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Permissions</th>
              <th className="p-3 text-left text-xs font-medium text-[color:var(--sf-muted)]">Last Login</th>
              <th className="p-3 text-right text-xs font-medium text-[color:var(--sf-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-[color:var(--sf-glass-border)] last:border-0">
                <td className="p-3 font-mono text-[color:var(--sf-text)]">{user.username}</td>
                <td className="p-3 text-[color:var(--sf-text)]">
                  {editingId === user.id ? (
                    <input
                      type="text"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="h-7 w-full rounded border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/90 px-2 text-xs text-[color:var(--sf-text)]"
                    />
                  ) : (
                    user.displayName || '-'
                  )}
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      user.isActive
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="max-w-[200px] p-3">
                  {editingId === user.id ? (
                    <PermissionCheckboxes selected={editPermissions} onChange={setEditPermissions} />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.permissions.slice(0, 3).map((p) => (
                        <span
                          key={p}
                          className="rounded bg-[color:var(--sf-surface)] px-1.5 py-0.5 text-xs text-[color:var(--sf-muted)]"
                        >
                          {p}
                        </span>
                      ))}
                      {user.permissions.length > 3 && (
                        <span className="text-xs text-[color:var(--sf-muted)]">
                          +{user.permissions.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="p-3 text-xs text-[color:var(--sf-muted)]">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    {editingId === user.id ? (
                      <>
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="rounded px-2 py-1 text-xs text-green-400 hover:bg-green-500/10"
                        >
                          {saving ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded px-2 py-1 text-xs text-[color:var(--sf-muted)] hover:bg-[color:var(--sf-surface)]"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(user)}
                          className="rounded px-2 py-1 text-xs text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          className="rounded px-2 py-1 text-xs text-yellow-400 hover:bg-yellow-500/10"
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => deleteUser(user)}
                          className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
