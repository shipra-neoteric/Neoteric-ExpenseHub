import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { Loader2, PlusCircle, ArrowUpCircle, Sliders, Lock, Unlock } from 'lucide-react';
import api, { apiErrorMessage } from '../api/client';
import useSites from '../hooks/useSites';
import ThemedSelect from '../components/common/ThemedSelect';
import { paiseToInr, formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { PERMISSIONS } from '../utils/permissions';
import FundAllocationDrawer from '../components/drawers/FundAllocationDrawer';
import FundMovementDrawer from '../components/drawers/FundMovementDrawer';

const LEDGER_TYPE_LABELS = {
  OPENING_ALLOCATION: 'Fund Added (Opening)',
  TOP_UP: 'Fund Added (Top-up)',
  EXPENSE_POSTED: 'Spent',
  EXPENSE_REVERSAL: 'Reversal',
  ADJUSTMENT: 'Adjustment',
  CARRY_FORWARD: 'Carried Forward',
};

export default function Funds() {
  const { hasPermission } = useAuth();
  const { getThemeColor } = useTheme();
  const { sites, siteId, selectSite } = useSites();
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState('');
  const [balance, setBalance] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [allocationDrawerOpen, setAllocationDrawerOpen] = useState(false);
  const [movementDrawer, setMovementDrawer] = useState(null); // 'topup' | 'adjustment' | null

  const canManage = hasPermission(PERMISSIONS.FUND_MANAGE);
  const canReopen = hasPermission(PERMISSIONS.MASTER_MANAGE);

  const loadPeriods = useCallback(async () => {
    if (!siteId) return;
    const { data } = await api.get('/funds/periods', { params: { siteId } });
    setPeriods(data.items);
    const openPeriod = data.items.find((p) => p.status === 'OPEN' || p.status === 'REOPENED');
    setPeriodId(openPeriod?._id || data.items[0]?._id || '');
  }, [siteId]);

  const loadPeriodData = useCallback(async () => {
    if (!periodId) {
      setBalance(null);
      setLedger([]);
      return;
    }
    setLoading(true);
    try {
      const [b, l] = await Promise.all([api.get(`/funds/periods/${periodId}/balance`), api.get(`/funds/periods/${periodId}/ledger`)]);
      setBalance(b.data.balance);
      setLedger(l.data.items);
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods]);
  useEffect(() => {
    loadPeriodData();
  }, [loadPeriodData]);

  const currentPeriod = periods.find((p) => p._id === periodId);
  const isOpenPeriod = currentPeriod && ['OPEN', 'REOPENED'].includes(currentPeriod.status);
  const siteName = sites.find((s) => s._id === siteId)?.name;

  const closePeriod = async () => {
    const { value } = await Swal.fire({
      title: 'Close this fund period?',
      html:
        '<textarea id="swal-reason" class="swal2-textarea" placeholder="Reconciliation notes / reason"></textarea>' +
        '<label class="swal2-checkbox" style="display:flex;align-items:center;gap:6px;justify-content:center;"><input type="checkbox" id="swal-carry" checked /> Carry forward remaining balance</label>',
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Close Period',
      confirmButtonColor: '#dc2626',
      preConfirm: () => {
        const reason = document.getElementById('swal-reason').value.trim();
        const carryForward = document.getElementById('swal-carry').checked;
        if (reason.length < 3) {
          Swal.showValidationMessage('A reconciliation reason is required');
          return false;
        }
        return { reason, carryForward };
      },
    });
    if (!value) return;
    try {
      await api.post(`/funds/periods/${periodId}/close`, value);
      await Swal.fire({ icon: 'success', title: 'Period closed', confirmButtonColor: 'var(--theme-primary)' });
      loadPeriods();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not close period', text: apiErrorMessage(err), confirmButtonColor: 'var(--theme-primary)' });
    }
  };

  const reopenPeriod = async () => {
    const ok = await Swal.fire({ title: 'Reopen this period?', icon: 'warning', showCancelButton: true, confirmButtonColor: 'var(--theme-primary)', confirmButtonText: 'Reopen' });
    if (!ok.isConfirmed) return;
    try {
      await api.post(`/funds/periods/${periodId}/reopen`);
      loadPeriods();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not reopen', text: apiErrorMessage(err), confirmButtonColor: 'var(--theme-primary)' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Funds / Imprest</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Ledger, top-ups, adjustments and period reconciliation</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <ThemedSelect label="Site" value={siteId} onChange={selectSite} options={sites.map((s) => ({ value: s._id, label: s.name }))} />
        </div>
        <div className="w-64">
          <ThemedSelect
            label="Fund Period"
            value={periodId}
            onChange={setPeriodId}
            options={periods.map((p) => ({ value: p._id, label: `${p.label} (${p.status})` }))}
            placeholder="No periods yet"
          />
        </div>
        {canManage && !isOpenPeriod && (
          <button onClick={() => setAllocationDrawerOpen(true)} style={{ backgroundColor: getThemeColor() }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90">
            <PlusCircle className="h-4 w-4" /> Open New Period
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : balance ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Total Funded" value={paiseToInr(balance.funded)} />
            <Kpi label="Approved Spend" value={paiseToInr(balance.approvedSpend)} />
            <Kpi label="Pending" value={paiseToInr(balance.pending)} />
            <Kpi label="Available" value={paiseToInr(balance.available)} highlight />
          </div>

          {canManage && isOpenPeriod && (
            <div className="flex flex-wrap gap-2">
              <ActionBtn icon={ArrowUpCircle} label="Add Top-up" onClick={() => setMovementDrawer('topup')} />
              <ActionBtn icon={Sliders} label="Adjustment" onClick={() => setMovementDrawer('adjustment')} />
              <ActionBtn icon={Lock} label="Close Period" onClick={closePeriod} variant="danger" />
            </div>
          )}
          {canReopen && currentPeriod?.status === 'CLOSED' && (
            <div className="flex flex-wrap gap-2">
              <ActionBtn icon={Unlock} label="Reopen Period" onClick={reopenPeriod} />
            </div>
          )}

          <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
            <div className="custom-horizontal-scrollbar overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Date</th>
                    <th className="px-6 py-3 text-left font-medium">Type</th>
                    <th className="px-6 py-3 text-left font-medium">Reason / Reference</th>
                    <th className="px-6 py-3 text-left font-medium">By</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {ledger.map((entry) => (
                    <tr key={entry._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{formatDateTime(entry.postedAt)}</td>
                      <td className="px-6 py-4 text-gray-900 dark:text-white">{LEDGER_TYPE_LABELS[entry.type] || entry.type}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{entry.relatedExpenseId?.expenseNumber || entry.reason || '—'}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{entry.createdBy?.name}</td>
                      <td className={`px-6 py-4 text-right font-bold ${entry.amountPaise < 0 ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>{paiseToInr(entry.amountPaise)}</td>
                    </tr>
                  ))}
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                        No ledger entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/10 dark:text-amber-300">
          No fund period selected for this site.{' '}
          {canManage && (
            <button onClick={() => setAllocationDrawerOpen(true)} className="font-semibold underline">
              Open one now
            </button>
          )}
        </div>
      )}

      <FundAllocationDrawer
        open={allocationDrawerOpen}
        onClose={() => setAllocationDrawerOpen(false)}
        siteId={siteId}
        siteName={siteName}
        onSaved={() => {
          setAllocationDrawerOpen(false);
          loadPeriods();
        }}
      />

      <FundMovementDrawer
        open={!!movementDrawer}
        onClose={() => setMovementDrawer(null)}
        periodId={periodId}
        siteName={siteName}
        mode={movementDrawer}
        onSaved={() => {
          setMovementDrawer(null);
          loadPeriodData();
        }}
      />
    </div>
  );
}

function Kpi({ label, value, highlight }) {
  return (
    <div className={`rounded-lg bg-white p-3 shadow dark:bg-gray-800 sm:p-4 ${highlight ? 'ring-2 ring-[var(--theme-primary)]' : ''}`}>
      <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">{label}</p>
      <p className="mt-2 text-2xl font-medium text-gray-900 dark:text-white sm:text-3xl">{value}</p>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, variant }) {
  const styles = variant === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600';
  return (
    <button onClick={onClick} className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition active:scale-95 ${styles}`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
