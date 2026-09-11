import React, { useEffect, useState } from 'react';
import api from '../../api/client';
import SitesTab from './SitesTab';
import CategoriesTab from './CategoriesTab';
import PolicyTab from './PolicyTab';
import ImportTab from './ImportTab';

const TABS = [
  { key: 'sites', label: 'Sites' },
  { key: 'categories', label: 'Categories' },
  { key: 'policy', label: 'Fund Policy & Approvals' },
  { key: 'import', label: 'Import Legacy Sheet' },
];

export default function MasterHome() {
  const [tab, setTab] = useState('sites');
  const [sites, setSites] = useState([]);

  useEffect(() => {
    api.get('/sites').then(({ data }) => setSites(data.items));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Master</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Configure sites, categories, and fund policies</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sites' && <SitesTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'policy' && <PolicyTab sites={sites} />}
      {tab === 'import' && <ImportTab />}
    </div>
  );
}
