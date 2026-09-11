import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Wallet, TrendingUp, Clock, PiggyBank, Paperclip } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client';
import useSites from '../hooks/useSites';
import useCategories from '../hooks/useCategories';
import StatsCards from '../components/common/StatsCards';
import ThemedSelect from '../components/common/ThemedSelect';
import ThemedDatePicker from '../components/common/ThemedDatePicker';
import IMSPagination from '../components/common/IMSPagination';
import ExpenseTable from '../components/table/ExpenseTable';
import ExpenseDrawer from '../components/drawers/ExpenseDrawer';
import ExpenseDetailsDrawer from '../components/drawers/ExpenseDetailsDrawer';
import { paiseToInr } from '../utils/format';
import { STATUS_META } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import { PERMISSIONS } from '../utils/permissions';
import { useTheme } from '../theme/ThemeContext';

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }));

export default function Dashboard() {
  const { hasPermission } = useAuth();
  const { getThemeColor } = useTheme();
  const { sites, siteId, selectSite, loading: sitesLoading } = useSites();
  const { categories } = useCategories();

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [filters, setFilters] = useState({ status: '', category: '', search: '', dateFrom: '', dateTo: '', receiptStatus: '' });
  const [page, setPage] = useState(1);
  const [listState, setListState] = useState({ items: [], total: 0, totalPages: 0 });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState(null);

  const loadSummary = useCallback(async () => {
    if (!siteId) return;
    setSummaryLoading(true);
    try {
      const { data } = await api.get('/dashboard/summary', { params: { siteId } });
      setSummary(data);
    } finally {
      setSummaryLoading(false);
    }
  }, [siteId]);

  const loadList = useCallback(async () => {
    if (!siteId) return;
    setListLoading(true);
    setListError('');
    try {
      const params = { siteId, page, limit: 10 };
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.search) params.search = filters.search;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.receiptStatus) params.receiptStatus = filters.receiptStatus;
      const { data } = await api.get('/expenses', { params });
      setListState(data);
    } catch (err) {
      setListError(apiErrorMessage(err));
    } finally {
      setListLoading(false);
    }
  }, [siteId, page, filters]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setPage(1);
  }, [filters, siteId]);

  const refreshAll = useCallback(() => {
    loadSummary();
    loadList();
  }, [loadSummary, loadList]);

  const cards = useMemo(() => {
    const bal = summary?.balance;
    return [
      { key: 'funded', label: 'Total Funded', value: bal ? paiseToInr(bal.funded) : '—', icon: PiggyBank },
      { key: 'approved', label: 'Approved Spend', value: bal ? paiseToInr(bal.approvedSpend) : '—', icon: TrendingUp },
      { key: 'pending', label: 'Pending Approval', value: bal ? paiseToInr(bal.pending) : '—', icon: Clock },
      {
        key: 'available',
        label: 'Available Balance',
        value: bal ? paiseToInr(bal.available) : '—',
        sub: bal ? `Projected: ${paiseToInr(bal.projectedAvailable)}` : undefined,
        icon: Wallet,
      },
      { key: 'missing_receipts', label: 'Missing Receipts', value: summary?.missingReceipts ?? '—', icon: Paperclip },
    ];
  }, [summary]);

  const onCardSelect = (key) => {
    if (key === 'approved') setFilters((f) => ({ ...f, status: 'APPROVED', receiptStatus: '' }));
    else if (key === 'pending') setFilters((f) => ({ ...f, status: 'PENDING_APPROVAL', receiptStatus: '' }));
    else if (key === 'missing_receipts') setFilters((f) => ({ ...f, receiptStatus: 'missing', status: '' }));
    else setFilters((f) => ({ ...f, status: '', receiptStatus: '' }));
  };

  const siteOptions = sites.map((s) => ({ value: s._id, label: s.name }));
  const categoryOptions = categories.map((c) => ({ value: c._id, label: c.name }));

  if (!sitesLoading && sites.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-lg font-medium">No sites assigned</p>
        <p className="text-sm">Ask your Master Admin to assign you to a site.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Site Expenses</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage site funds, daily expenses and reconciliations</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {sites.length > 1 && (
            <div className="w-48">
              <ThemedSelect label="Site" value={siteId} onChange={selectSite} options={siteOptions} />
            </div>
          )}
          {hasPermission(PERMISSIONS.CREATE) && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              disabled={!siteId || summary?.hasOpenPeriod === false}
              style={{ backgroundColor: getThemeColor() }}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add Expense
            </button>
          )}
        </div>
      </div>

      {summary && summary.hasFund === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          No fund has been set up for this site yet. Ask Master to create an opening allocation under Funds / Imprest.
        </div>
      )}
      {summary && summary.hasFund && summary.hasOpenPeriod === false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          There is no open fund period for this site right now. New expenses cannot be submitted until one is opened.
        </div>
      )}

      <StatsCards cards={cards} activeKey={filters.status === 'APPROVED' ? 'approved' : filters.status === 'PENDING_APPROVAL' ? 'pending' : filters.receiptStatus === 'missing' ? 'missing_receipts' : null} onSelect={onCardSelect} />

      <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-wrap items-end gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="w-56">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Expense #, description, merchant…"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div className="w-44">
            <ThemedSelect label="Status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))} options={STATUS_OPTIONS} placeholder="All statuses" />
          </div>
          <div className="w-52">
            <ThemedSelect label="Category" value={filters.category} onChange={(v) => setFilters((f) => ({ ...f, category: v }))} options={categoryOptions} placeholder="All categories" />
          </div>
          <div className="w-40">
            <ThemedDatePicker label="From" value={filters.dateFrom} onChange={(v) => setFilters((f) => ({ ...f, dateFrom: v }))} max={filters.dateTo || undefined} />
          </div>
          <div className="w-40">
            <ThemedDatePicker label="To" value={filters.dateTo} onChange={(v) => setFilters((f) => ({ ...f, dateTo: v }))} min={filters.dateFrom || undefined} />
          </div>
          {(filters.status || filters.category || filters.search || filters.dateFrom || filters.dateTo || filters.receiptStatus) && (
            <button
              type="button"
              onClick={() => setFilters({ status: '', category: '', search: '', dateFrom: '', dateTo: '', receiptStatus: '' })}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10"
            >
              Clear filters
            </button>
          )}
        </div>

        <ExpenseTable items={listState.items} loading={listLoading} error={listError} onRowClick={(exp) => setSelectedExpenseId(exp._id)} />
        <IMSPagination page={page} totalPages={listState.totalPages} total={listState.total} limit={10} onPageChange={setPage} />
      </div>

      <ExpenseDrawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        siteId={siteId}
        sites={sites}
        categories={categories}
        onSaved={() => {
          setAddOpen(false);
          refreshAll();
        }}
      />

      <ExpenseDetailsDrawer
        expenseId={selectedExpenseId}
        onClose={() => setSelectedExpenseId(null)}
        onChanged={refreshAll}
        categories={categories}
        sites={sites}
      />
    </div>
  );
}
