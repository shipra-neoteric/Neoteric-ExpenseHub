import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Building2, CheckCircle2, FileText } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client';
import { paiseToInr, formatDateTime } from '../utils/format';
import { useTheme } from '../theme/ThemeContext';
import ThemedSelect from '../components/common/ThemedSelect';
import FundMovementDrawer from '../components/drawers/FundMovementDrawer';

// One page, every site: how much each site has left, how much is owed to
// bring it up to its standard monthly amount, and a button to send that
// payment (with optional proof) right from this row — instead of switching
// the site dropdown on the regular Funds page one at a time. The Site filter
// here just narrows this same table down to one row when needed — it
// doesn't refetch anything, the overview already has every site in one call.
export default function MonthlyTransfers() {
  const { getThemeColor } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payRow, setPayRow] = useState(null);
  const [siteFilter, setSiteFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: resp } = await api.get('/funds/overview');
      setData(resp);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const siteOptions = useMemo(() => (data?.rows || []).map((r) => ({ value: r.siteId || r.siteName, label: r.siteName })), [data]);
  const visibleRows = useMemo(() => {
    const rows = data?.rows || [];
    if (!siteFilter) return rows;
    return rows.filter((r) => (r.siteId || r.siteName) === siteFilter);
  }, [data, siteFilter]);
  const visibleTransfers = useMemo(() => {
    const transfers = data?.transfers || [];
    if (!siteFilter) return transfers;
    return transfers.filter((t) => t.siteId === siteFilter || t.siteName === siteFilter);
  }, [data, siteFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monthly Transfers</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {data ? `As of ${data.label}` : 'Send each site its monthly payment from one place'}
          </p>
        </div>
        <div className="w-56">
          <ThemedSelect label="Site" value={siteFilter} onChange={setSiteFilter} options={siteOptions} placeholder="All sites" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-12 text-center text-sm text-red-500">{error}</div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center text-gray-400 shadow dark:border-gray-700 dark:bg-gray-800">No active sites.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleRows.map((row) => {
            const needsTransfer = !row.noFund && row.nextMonthTransferPaise > 0;
            return (
              <div key={row.siteId || row.siteName} className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="theme-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{row.siteName}</p>
                      <p className="text-xs text-gray-400">{row.noFund ? 'No fund set up' : row.periodRangeLabel}</p>
                    </div>
                  </div>
                  {!row.noFund && !needsTransfer && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />}
                </div>

                {!row.noFund && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Remaining</p>
                      <p className="font-semibold text-gray-900 dark:text-white">{paiseToInr(row.availablePaise)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Pending</p>
                      <p className="font-semibold text-gray-600 dark:text-gray-300">{paiseToInr(row.pendingPaise)}</p>
                    </div>
                  </div>
                )}

                {!row.noFund && (
                  <div className={`rounded-lg border px-3 py-2 ${needsTransfer ? 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-900/10' : 'border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-900/10'}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Transfer Needed</p>
                    <p className={`text-xl font-bold ${needsTransfer ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{paiseToInr(row.nextMonthTransferPaise)}</p>
                  </div>
                )}

                {!row.noFund && (
                  <button
                    type="button"
                    onClick={() => setPayRow(row)}
                    style={{ backgroundColor: getThemeColor() }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    <Send className="h-4 w-4" /> Send Payment
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-200 px-6 py-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Transfer History</div>
          <div className="custom-horizontal-scrollbar overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 text-left font-medium">Date</th>
                  <th className="px-6 py-3 text-left font-medium">Site</th>
                  <th className="px-6 py-3 text-left font-medium">Paid To</th>
                  <th className="px-6 py-3 text-left font-medium">Sent By</th>
                  <th className="px-6 py-3 text-right font-medium">Amount</th>
                  <th className="px-6 py-3 text-left font-medium">Proof</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{formatDateTime(t.postedAt)}</td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{t.siteName}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{t.paidToName || '—'}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{t.sentBy || '—'}</td>
                    <td className="px-6 py-4 text-right font-bold text-green-600 dark:text-green-400">{paiseToInr(t.amountPaise)}</td>
                    <td className="px-6 py-4">
                      {t.proofUrl ? (
                        <a href={t.proofUrl} target="_blank" rel="noreferrer" className="theme-text flex items-center gap-1.5 text-xs hover:underline">
                          <FileText className="h-3.5 w-3.5" /> View
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">No proof</span>
                      )}
                    </td>
                  </tr>
                ))}
                {visibleTransfers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                      No transfers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FundMovementDrawer
        open={!!payRow}
        onClose={() => setPayRow(null)}
        periodId={payRow?.periodId}
        siteName={payRow?.siteName}
        mode="topup"
        initialAmount={payRow?.nextMonthTransferPaise > 0 ? (payRow.nextMonthTransferPaise / 100).toFixed(2) : ''}
        initialReason={`Monthly transfer — ${data?.label || ''}`}
        onSaved={() => {
          setPayRow(null);
          load();
        }}
      />
    </div>
  );
}
