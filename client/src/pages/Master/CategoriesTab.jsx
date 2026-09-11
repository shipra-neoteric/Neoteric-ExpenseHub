import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../../api/client';
import ThemedSelect from '../../components/common/ThemedSelect';
import { RECEIPT_RULE_OPTIONS } from './masterConstants';
import { useTheme } from '../../theme/ThemeContext';
import CategoryDrawer from '../../components/drawers/CategoryDrawer';

export default function CategoriesTab() {
  const { getThemeColor } = useTheme();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/categories', { params: { all: 'true' } });
      setCategories(data.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateReceiptRule = async (category, receiptRule) => {
    await api.patch(`/categories/${category._id}`, { receiptRule });
    load();
  };

  const toggleActive = async (category) => {
    await api.patch(`/categories/${category._id}`, { isActive: !category.isActive });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setDrawerOpen(true)} style={{ backgroundColor: getThemeColor() }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
          <Plus className="h-4 w-4" /> New Category
        </button>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full">
          <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-6 py-3 text-left font-medium">Name</th>
              <th className="px-6 py-3 text-left font-medium">Code</th>
              <th className="px-6 py-3 text-left font-medium">Receipt Rule</th>
              <th className="px-6 py-3 text-left font-medium">Status</th>
              <th className="px-6 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {categories.map((c) => (
              <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{c.name}</td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{c.code}</td>
                <td className="w-52 px-6 py-4">
                  <ThemedSelect value={c.receiptRule} onChange={(v) => updateReceiptRule(c, v)} options={RECEIPT_RULE_OPTIONS} />
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                    {c.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => toggleActive(c)} className="theme-text text-sm font-medium hover:underline">
                    {c.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {!loading && categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CategoryDrawer
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
