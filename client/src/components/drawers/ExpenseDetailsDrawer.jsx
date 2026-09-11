import React, { useEffect, useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { Loader2, FileText, CheckCircle2, XCircle, RotateCcw, Undo2, Pencil, Trash2, Send, Receipt } from 'lucide-react';
import DrawerShell from './DrawerShell';
import ExpenseDrawer from './ExpenseDrawer';
import StatusPill from '../common/StatusPill';
import api, { apiErrorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { paiseToInr, formatDateTime, formatDate } from '../../utils/format';
import { PERMISSIONS } from '../../utils/permissions';

const ACTION_LABELS = {
  CREATE_DRAFT: 'Created as draft',
  EDIT: 'Edited',
  SUBMIT: 'Submitted for approval',
  RESUBMIT: 'Resubmitted for approval',
  APPROVE: 'Approved',
  RETURN: 'Returned for correction',
  REJECT: 'Rejected',
  VOID: 'Voided',
  DELETE_DRAFT: 'Draft deleted',
};

const sectionHeadingClass = 'text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3';

async function confirmWithReason({ title, confirmText, icon = 'warning' }) {
  const { value } = await Swal.fire({
    title,
    input: 'textarea',
    inputPlaceholder: 'Reason (required)',
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    confirmButtonColor: 'var(--theme-primary)',
    inputValidator: (v) => (!v || v.trim().length < 3 ? 'A reason is required' : undefined),
  });
  return value?.trim();
}

export default function ExpenseDetailsDrawer({ expenseId, onClose, onChanged, categories, sites }) {
  const { user, hasPermission } = useAuth();
  const { getThemeColor } = useTheme();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!expenseId) return;
    setLoading(true);
    try {
      const { data: res } = await api.get(`/expenses/${expenseId}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [expenseId]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (fn, successMessage) => {
    setActionLoading(true);
    try {
      await fn();
      if (successMessage) await Swal.fire({ icon: 'success', title: successMessage, confirmButtonColor: 'var(--theme-primary)', timer: 1500, showConfirmButton: false });
      await load();
      onChanged?.();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: 'Action failed', text: apiErrorMessage(err), confirmButtonColor: 'var(--theme-primary)' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!expenseId) return null;
  const expense = data?.expense;
  const isOwner = expense && String(expense.createdBy?._id || expense.createdBy) === String(user?._id || user?.id);

  return (
    <>
      <DrawerShell open={!!expenseId} onClose={onClose} icon={Receipt} title={expense ? `Expense ${expense.expenseNumber}` : 'Expense'} subtitle={expense?.categorySnapshot?.name} width="2xl">
        {loading || !expense ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <StatusPill status={expense.status} />
              <span className="text-lg font-black text-gray-900 dark:text-white">{paiseToInr(expense.amountPaise)}</span>
            </div>

            {data.balance && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Available balance</p>
                  <p className="font-bold text-gray-900 dark:text-white">{paiseToInr(data.balance.available)}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Projected available</p>
                  <p className="font-bold text-gray-900 dark:text-white">{paiseToInr(data.balance.projectedAvailable)}</p>
                </div>
              </div>
            )}

            <section>
              <h3 className={sectionHeadingClass}>Details</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-3">
                <Field label="Expense Date" value={formatDate(expense.expenseDate)} />
                <Field label="Payment Mode" value={expense.paymentMode} />
                <Field label="Category" value={expense.categorySnapshot?.name} />
                <Field label="Merchant" value={expense.merchant || '—'} />
                <Field label="Paid By" value={expense.paidByUserId?.name} />
                <Field label="Submitted By" value={expense.createdBy?.name} />
              </div>
            </section>

            <section>
              <h3 className={sectionHeadingClass}>Description</h3>
              <p className="text-sm text-gray-900 dark:text-white">{expense.description}</p>
              {expense.notes && (
                <>
                  <h3 className={`${sectionHeadingClass} mt-3`}>Notes</h3>
                  <p className="text-sm text-gray-900 dark:text-white">{expense.notes}</p>
                </>
              )}
            </section>

            {expense.returnReason && <ReasonBanner label="Return reason" reason={expense.returnReason} tone="orange" />}
            {expense.rejectReason && <ReasonBanner label="Rejection reason" reason={expense.rejectReason} tone="red" />}
            {expense.voidReason && <ReasonBanner label="Void reason" reason={expense.voidReason} tone="slate" />}

            <section>
              <h3 className={sectionHeadingClass}>Receipts</h3>
              {data.attachments.length === 0 ? (
                <p className="text-sm text-gray-400">No receipt attached.</p>
              ) : (
                <div className="space-y-2">
                  {data.attachments.map((a) => (
                    <a
                      key={a._id}
                      href={`/api/expenses/${expense._id}/attachments/${a._id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="theme-text flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:underline dark:border-gray-700"
                    >
                      <FileText className="h-4 w-4" /> {a.originalName}
                    </a>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className={sectionHeadingClass}>Activity Timeline</h3>
              <ol className="space-y-3 border-l border-gray-200 pl-4 dark:border-gray-700">
                {data.timeline.map((t) => (
                  <li key={t._id} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getThemeColor() }} />
                    <p className="font-medium text-gray-900 dark:text-white">{ACTION_LABELS[t.action] || t.action}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t.actorId?.name} • {formatDateTime(t.createdAt)}
                    </p>
                    {t.reason && <p className="mt-0.5 text-xs italic text-gray-500 dark:text-gray-400">"{t.reason}"</p>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}

        {expense && (
          <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            {expense.status === 'DRAFT' && isOwner && hasPermission(PERMISSIONS.EDIT_OWN_DRAFT) && (
              <>
                <ActionButton icon={Pencil} label="Edit" onClick={() => setEditOpen(true)} disabled={actionLoading} />
                <ActionButton
                  icon={Send}
                  label="Submit"
                  variant="primary"
                  disabled={actionLoading}
                  onClick={() => runAction(() => api.post(`/expenses/${expense._id}/submit`), 'Submitted')}
                />
                <ActionButton
                  icon={Trash2}
                  label="Delete Draft"
                  variant="danger"
                  disabled={actionLoading}
                  onClick={async () => {
                    const ok = await Swal.fire({ title: 'Delete this draft?', text: 'This cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'Delete' });
                    if (ok.isConfirmed)
                      await runAction(async () => {
                        await api.delete(`/expenses/${expense._id}`);
                        onClose();
                      }, 'Draft deleted');
                  }}
                />
              </>
            )}

            {expense.status === 'PENDING_APPROVAL' && hasPermission(PERMISSIONS.APPROVE) && (
              <ActionButton
                icon={CheckCircle2}
                label="Approve"
                variant="success"
                disabled={actionLoading}
                onClick={async () => {
                  const ok = await Swal.fire({ title: 'Approve this expense?', text: `${paiseToInr(expense.amountPaise)} will be posted to the fund ledger.`, icon: 'question', showCancelButton: true, confirmButtonColor: 'var(--theme-primary)', confirmButtonText: 'Approve' });
                  if (ok.isConfirmed) await runAction(() => api.post(`/expenses/${expense._id}/approve`), 'Approved');
                }}
              />
            )}
            {expense.status === 'PENDING_APPROVAL' && hasPermission(PERMISSIONS.REJECT_RETURN) && (
              <>
                <ActionButton
                  icon={RotateCcw}
                  label="Return for Correction"
                  onClick={async () => {
                    const reason = await confirmWithReason({ title: 'Return for correction', confirmText: 'Return' });
                    if (reason) await runAction(() => api.post(`/expenses/${expense._id}/return`, { reason }), 'Returned');
                  }}
                  disabled={actionLoading}
                />
                <ActionButton
                  icon={XCircle}
                  label="Reject"
                  variant="danger"
                  onClick={async () => {
                    const reason = await confirmWithReason({ title: 'Reject this expense', confirmText: 'Reject' });
                    if (reason) await runAction(() => api.post(`/expenses/${expense._id}/reject`, { reason }), 'Rejected');
                  }}
                  disabled={actionLoading}
                />
              </>
            )}

            {expense.status === 'RETURNED' && isOwner && hasPermission(PERMISSIONS.EDIT_OWN_DRAFT) && (
              <ActionButton icon={Pencil} label="Edit and Resubmit" variant="primary" onClick={() => setEditOpen(true)} disabled={actionLoading} />
            )}

            {expense.status === 'APPROVED' && hasPermission(PERMISSIONS.VOID) && (
              <ActionButton
                icon={Undo2}
                label="Void / Reverse"
                variant="danger"
                onClick={async () => {
                  const reason = await confirmWithReason({ title: 'Void this approved expense?', confirmText: 'Void' });
                  if (reason) await runAction(() => api.post(`/expenses/${expense._id}/void`, { reason }), 'Voided');
                }}
                disabled={actionLoading}
              />
            )}
          </div>
        )}
      </DrawerShell>

      {expense && (
        <ExpenseDrawer
          open={editOpen}
          onClose={() => setEditOpen(false)}
          siteId={expense.siteId}
          sites={sites}
          categories={categories}
          editExpense={expense}
          onSaved={() => {
            setEditOpen(false);
            load();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-gray-800 dark:text-gray-200">{value}</p>
    </div>
  );
}

function ReasonBanner({ label, reason, tone }) {
  const tones = {
    orange: 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800/40 dark:bg-orange-900/10 dark:text-orange-300',
    red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-300',
    slate: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700/40 dark:bg-slate-800/40 dark:text-slate-300',
  };
  return (
    <div className={`rounded-xl border p-3.5 text-sm ${tones[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
      <p>{reason}</p>
    </div>
  );
}

// Button variants follow UI_STYLE_GUIDE.md section 7 exactly: primary CTAs
// use the dynamic per-company color inline; Approve is always static green
// and destructive actions are always static red, regardless of brand color.
function ActionButton({ icon: Icon, label, onClick, disabled, variant }) {
  const { getThemeColor } = useTheme();
  const base = 'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95';
  if (variant === 'primary') {
    return (
      <button type="button" disabled={disabled} onClick={onClick} style={{ backgroundColor: getThemeColor() }} className={`${base} text-white hover:opacity-90`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }
  const styles = {
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${styles[variant] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
