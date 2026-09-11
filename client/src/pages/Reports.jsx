import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client';
import useSites from '../hooks/useSites';
import useCategories from '../hooks/useCategories';
import ThemedSelect from '../components/common/ThemedSelect';
import ThemedDatePicker from '../components/common/ThemedDatePicker';
import { paiseToInr } from '../utils/format';
import { STATUS_META } from '../utils/permissions';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }));

async function downloadCsv(params) {
  const { data } = await api.get('/reports/export.csv', { params, responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'site-expenses-report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Reports() {
  const { getThemeColor } = useTheme();
  const { user } = useAuth();
  const { sites } = useSites();
  const { categories } = useCategories();
  const [filters, setFilters] = useState({ siteId: '', category: '', status: '', dateFrom: '', dateTo: '' });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  const buildParams = () => {
    const params = {};
    if (filters.siteId) params.siteId = filters.siteId;
    if (filters.category) params.category = filters.category;
    if (filters.status) params.status = filters.status;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    return params;
  };

  const runSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/reports/summary', { params: buildParams() });
      setSummary(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = async () => {
    setExporting('csv');
    try {
      await downloadCsv(buildParams());
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setExporting('');
    }
  };

  const exportPdf = async () => {
    setExporting('pdf');
    setError('');
    try {
      const { data } = await api.get('/reports/summary', { params: buildParams() });
      const siteNames = filters.siteId ? sites.filter((s) => s._id === filters.siteId).map((s) => s.name) : sites.map((s) => s.name);
      const parts = [];
      if (filters.dateFrom) parts.push(`from ${filters.dateFrom}`);
      if (filters.dateTo) parts.push(`to ${filters.dateTo}`);
      if (filters.status) parts.push(`status: ${STATUS_META[filters.status]?.label}`);
      if (filters.category) parts.push('category filtered');
      const { exportSiteExpensesPdf } = await import('../utils/pdfExport');
      exportSiteExpensesPdf({
        expenses: data.expenses,
        totals: data.totals,
        filters: { siteNames, summary: parts.join(', ') },
        generatedBy: user?.name || '',
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setExporting('');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Audit-friendly expense reporting and export</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <ThemedSelect label="Site" value={filters.siteId} onChange={(v) => setFilters((f) => ({ ...f, siteId: v }))} options={sites.map((s) => ({ value: s._id, label: s.name }))} placeholder="All accessible sites" />
          </div>
          <div className="w-52">
            <ThemedSelect label="Category" value={filters.category} onChange={(v) => setFilters((f) => ({ ...f, category: v }))} options={categories.map((c) => ({ value: c._id, label: c.name }))} placeholder="All categories" />
          </div>
          <div className="w-44">
            <ThemedSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={STATUS_OPTIONS} placeholder="All statuses" />
          </div>
          <div className="w-40">
            <ThemedDatePicker label="From" value={filters.dateFrom} onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))} max={filters.dateTo || undefined} />
          </div>
          <div className="w-40">
            <ThemedDatePicker label="To" value={filters.dateTo} onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))} min={filters.dateFrom || undefined} />
          </div>
          <button onClick={runSummary} style={{ backgroundColor: getThemeColor() }} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
            Apply Filters
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={exportCsv}
          disabled={!!exporting}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          {exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Export CSV
        </button>
        <button
          onClick={exportPdf}
          disabled={!!exporting}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Export PDF
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard label="Approved Spend" value={paiseToInr(summary.totals.approvedSpend)} />
            <SummaryCard label="Pending Amount" value={paiseToInr(summary.totals.pendingAmount)} />
            <SummaryCard label="Expense Rows" value={summary.expenses.length} />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-3 text-sm font-bold text-gray-900 dark:text-white">Category-wise Spend</h2>
            <div className="space-y-2">
              {Object.entries(summary.totals.categoryWise).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{cat}</span>
                  <span className="font-bold text-gray-900 dark:text-white">{paiseToInr(amt)}</span>
                </div>
              ))}
              {Object.keys(summary.totals.categoryWise).length === 0 && <p className="text-sm text-gray-400">No data for the selected filters.</p>}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow dark:bg-gray-800 sm:p-4">
      <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">{label}</p>
      <p className="mt-2 text-2xl font-medium text-gray-900 dark:text-white sm:text-3xl">{value}</p>
    </div>
  );
}
