import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { Plus, UserPlus } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client';
import ThemedSelect from '../components/common/ThemedSelect';
import { useTheme } from '../theme/ThemeContext';
import UserDrawer from '../components/drawers/UserDrawer';

export default function UserManagement() {
  const { getThemeColor } = useTheme();
  const [users, setUsers] = useState([]);
  const [sites, setSites] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadAll = async () => {
    const [u, s, a] = await Promise.all([api.get('/users'), api.get('/sites'), api.get('/assignments')]);
    setUsers(u.data.items);
    setSites(s.data.items);
    setAssignments(a.data.items);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const assign = async () => {
    if (!selectedUserId || !selectedSiteId) return;
    try {
      await api.post('/assignments', { userId: selectedUserId, siteId: selectedSiteId });
      loadAll();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not assign', text: apiErrorMessage(err), confirmButtonColor: 'var(--theme-primary)' });
    }
  };

  const deactivate = async (assignment) => {
    await api.post(`/assignments/${assignment._id}/deactivate`);
    loadAll();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Users, roles, and site assignments</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Users</h2>
          <button onClick={() => setDrawerOpen(true)} style={{ backgroundColor: getThemeColor() }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
            <Plus className="h-4 w-4" /> New User
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Name</th>
                <th className="px-6 py-3 text-left font-medium">Email</th>
                <th className="px-6 py-3 text-left font-medium">Role</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{u.name}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{u.email}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{u.roleLabel}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Site Assignments</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <ThemedSelect label="User" value={selectedUserId} onChange={setSelectedUserId} options={users.map((u) => ({ value: u._id, label: u.name }))} />
          </div>
          <div className="w-56">
            <ThemedSelect label="Site" value={selectedSiteId} onChange={setSelectedSiteId} options={sites.map((s) => ({ value: s._id, label: s.name }))} />
          </div>
          <button onClick={assign} style={{ backgroundColor: getThemeColor() }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
            <UserPlus className="h-4 w-4" /> Assign
          </button>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-6 py-3 text-left font-medium">User</th>
                <th className="px-6 py-3 text-left font-medium">Site</th>
                <th className="px-6 py-3 text-left font-medium">Status</th>
                <th className="px-6 py-3 text-left font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {assignments.map((a) => (
                <tr key={a._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-gray-900 dark:text-white">{a.userId?.name}</td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{a.siteId?.name}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${a.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                      {a.isActive ? 'Active' : 'Removed'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {a.isActive && (
                      <button onClick={() => deactivate(a)} className="text-sm font-medium text-red-500 hover:underline">
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <UserDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          loadAll();
        }}
      />
    </div>
  );
}
