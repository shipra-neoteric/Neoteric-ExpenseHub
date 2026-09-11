import React, { useEffect, useState } from 'react';
import { Plus, Building2 } from 'lucide-react';
import api from '../../api/client';
import { useTheme } from '../../theme/ThemeContext';
import SiteDrawer from '../../components/drawers/SiteDrawer';

export default function SitesTab() {
  const { getThemeColor } = useTheme();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/sites');
      setSites(data.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (site) => {
    const nextStatus = site.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    await api.patch(`/sites/${site._id}`, { status: nextStatus });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setDrawerOpen(true)} style={{ backgroundColor: getThemeColor() }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
          <Plus className="h-4 w-4" /> New Site
        </button>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full">
          <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 text-left font-medium">Code</th>
              <th className="px-6 py-3 text-left font-medium">Name</th>
              <th className="px-6 py-3 text-left font-medium">Sales Office</th>
              <th className="px-6 py-3 text-left font-medium">Status</th>
              <th className="px-6 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {sites.map((s) => (
              <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{s.code}</td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-gray-400" /> {s.name}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{s.salesOfficeLabel || '—'}</td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.status === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => toggleStatus(s)} className="theme-text text-sm font-medium hover:underline">
                    {s.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && sites.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                  No sites yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SiteDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => {
          setDrawerOpen(false);
          load();
        }}
      />
    </div>
  );
}
