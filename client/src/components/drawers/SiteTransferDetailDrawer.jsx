import React, { useEffect, useState } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import ExpenseDetailsDrawer from './ExpenseDetailsDrawer';
import api, { apiErrorMessage } from '../../api/client';
import { paiseToInr, formatDateTime } from '../../utils/format';

const LEDGER_TYPE_LABELS = {
  OPENING_ALLOCATION: 'Fund Added (Opening)',
  TOP_UP: 'Fund Added (Top-up)',
  EXPENSE_POSTED: 'Spent',
  EXPENSE_REVERSAL: 'Reversal',
  ADJUSTMENT: 'Adjustment',
  CARRY_FORWARD: 'Carried Forward',
};

// Read-only detail view for one site, opened from its card on the Monthly
// Transfers page — same balance + ledger data as the regular Funds page,
// just scoped to this one site without switching dropdowns.
export default function SiteTransferDetailDrawer({ open, onClose, periodId, siteName }) {
  const [balance, setBalance] = useState(null);
  const [standardAmountPaise, setStandardAmountPaise] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expenseDetailId, setExpenseDetailId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [b, l] = await Promise.all([api.get(`/funds/periods/${periodId}/balance`), api.get(`/funds/periods/${periodId}/ledger`)]);
      setBalance(b.data.balance);
      setStandardAmountPaise(b.data.standardAmountPaise);
      setLedger(l.data.items);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !periodId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, periodId]);

  return (
    <DrawerShell open={open} onClose={onClose} icon={Building2} title={siteName} subtitle="Fund details" width="2xl" footer={<DrawerCancelButton onClick={onClose}>Close</DrawerCancelButton>}>
      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      ) : (
        balance && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi label="Total Funded" value={standardAmountPaise != null ? paiseToInr(standardAmountPaise) : '—'} />
              <Kpi label="Approved Spend" value={paiseToInr(balance.approvedSpend)} />
              <Kpi label="Pending" value={paiseToInr(balance.pending)} />
              <Kpi label="Available" value={paiseToInr(balance.projectedAvailable)} sub={`Before pending: ${paiseToInr(balance.available)}`} highlight />
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 dark:border-gray-700 dark:text-gray-300">Ledger</div>
              <div className="custom-scrollbar custom-horizontal-scrollbar max-h-[360px] overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="sticky top-0 z-10 bg-white text-xs uppercase tracking-wide text-gray-500 dark:bg-[#0F172A] dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">Date</th>
                      <th className="px-4 py-2.5 text-left font-medium">Type</th>
                      <th className="px-4 py-2.5 text-left font-medium">Reason / Reference</th>
                      <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {ledger.map((entry) => (
                      <tr key={entry._id}>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDateTime(entry.postedAt)}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white">{LEDGER_TYPE_LABELS[entry.type] || entry.type}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {entry.relatedExpenseId?.expenseNumber ? (
                            <button type="button" onClick={() => setExpenseDetailId(entry.relatedExpenseId._id)} className="theme-text font-medium hover:underline">
                              {entry.relatedExpenseId.expenseNumber}
                            </button>
                          ) : (
                            entry.reason || '—'
                          )}
                          {entry.paidToName && <span className="block text-xs text-gray-400">Paid to: {entry.paidToName}</span>}
                          {entry.proofUrl && (
                            <a href={entry.proofUrl} target="_blank" rel="noreferrer" className="theme-text block text-xs hover:underline">
                              View payment proof
                            </a>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${entry.amountPaise < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{paiseToInr(entry.amountPaise)}</td>
                      </tr>
                    ))}
                    {ledger.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                          No ledger entries yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      <ExpenseDetailsDrawer expenseId={expenseDetailId} onClose={() => setExpenseDetailId(null)} onChanged={load} categories={[]} sites={[]} />
    </DrawerShell>
  );
}

function Kpi({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-lg bg-gray-50 p-3 dark:bg-gray-900/40 ${highlight ? 'ring-2 ring-[var(--theme-primary)]' : ''}`}>
      <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
