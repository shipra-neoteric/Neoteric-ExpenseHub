import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { Loader2, UploadCloud, FileText, X, Info, Receipt } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import ThemedSelect from '../common/ThemedSelect';
import ThemedDatePicker from '../common/ThemedDatePicker';
import { fieldLabelClass, fieldInputClass, fieldTextareaClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import api, { apiErrorMessage, apiErrorCode, apiErrorDetails } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { paiseToInr, toDateInputValue } from '../../utils/format';
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from '../../utils/permissions';

const emptyForm = {
  categoryId: '',
  expenseDate: toDateInputValue(new Date()),
  description: '',
  merchant: '',
  amount: '',
  paymentMode: 'CASH',
  notes: '',
};

function serialize(form) {
  return JSON.stringify(form);
}

// Reused for both "Add Expense" (siteId + categories passed in, no expenseId)
// and re-opened on an existing DRAFT/RETURNED expense to keep editing it.
export default function ExpenseDrawer({ open, onClose, siteId, sites, categories, onSaved, editExpense }) {
  const { user } = useAuth();
  const { getThemeColor } = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [expenseId, setExpenseId] = useState(null);
  const [version, setVersion] = useState(0);
  const [attachments, setAttachments] = useState([]);
  const [balance, setBalance] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const savedSnapshotRef = useRef(serialize(emptyForm));

  const isEdit = !!editExpense;

  useEffect(() => {
    if (!open) return;
    if (editExpense) {
      const initial = {
        categoryId: editExpense.categoryId,
        expenseDate: toDateInputValue(editExpense.expenseDate),
        description: editExpense.description,
        merchant: editExpense.merchant || '',
        amount: (editExpense.amountPaise / 100).toFixed(2),
        paymentMode: editExpense.paymentMode,
        notes: editExpense.notes || '',
      };
      setExpenseId(editExpense._id);
      setVersion(editExpense.version);
      setForm(initial);
      savedSnapshotRef.current = serialize(initial);
      loadAttachments(editExpense._id);
    } else {
      setExpenseId(null);
      setVersion(0);
      setForm(emptyForm);
      savedSnapshotRef.current = serialize(emptyForm);
      setAttachments([]);
    }
    setErrors({});
    setBanner('');
  }, [open, editExpense]);

  useEffect(() => {
    if (!open || !siteId) return;
    api.get('/dashboard/summary', { params: { siteId } }).then(({ data }) => setBalance(data.balance || null));
  }, [open, siteId]);

  const loadAttachments = async (id) => {
    const { data } = await api.get(`/expenses/${id}`);
    setAttachments(data.attachments || []);
  };

  const site = sites?.find((s) => s._id === siteId);
  const amountPaise = useMemo(() => {
    const n = parseFloat(form.amount);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }, [form.amount]);
  const projectedAfter = balance ? balance.available - amountPaise : null;
  const isDirty = serialize(form) !== savedSnapshotRef.current;

  const confirmBeforeClose = async () => {
    if (!isDirty) return true;
    const result = await Swal.fire({
      title: 'Discard unsaved changes?',
      text: 'You have changes that have not been saved as a draft.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Discard',
      cancelButtonText: 'Keep editing',
      confirmButtonColor: '#dc2626',
    });
    return result.isConfirmed;
  };

  const validate = () => {
    const e = {};
    if (!form.categoryId) e.categoryId = 'Category is required';
    if (!form.description || form.description.trim().length < 3) e.description = 'Please describe the expense (min 3 characters)';
    if (!form.amount || amountPaise <= 0) e.amount = 'Enter a valid amount greater than zero';
    if (!form.expenseDate) e.expenseDate = 'Date is required';
    else if (new Date(form.expenseDate) > new Date()) e.expenseDate = 'Date cannot be in the future';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildPayload = () => ({
    categoryId: form.categoryId,
    expenseDate: form.expenseDate,
    description: form.description.trim(),
    merchant: form.merchant.trim(),
    amount: form.amount,
    paymentMode: form.paymentMode,
    notes: form.notes.trim(),
  });

  const saveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      if (expenseId) {
        const { data } = await api.patch(`/expenses/${expenseId}`, { ...buildPayload(), expectedVersion: version });
        setVersion(data.expense.version);
        savedSnapshotRef.current = serialize(form);
        setBanner('Draft saved.');
      } else {
        const { data } = await api.post('/expenses', { siteId, ...buildPayload(), idempotencyKey });
        setExpenseId(data.expense._id);
        setVersion(data.expense.version);
        savedSnapshotRef.current = serialize(form);
        setBanner('Draft saved. You can attach a receipt below, then submit when ready.');
      }
    } catch (err) {
      setBanner(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const doSubmit = async (id, duplicateOverrideReason) => {
    const { data } = await api.post(`/expenses/${id}/submit`, duplicateOverrideReason ? { duplicateOverrideReason } : {});
    return data.expense;
  };

  const submitExpense = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setBanner('');
    try {
      let id = expenseId;
      if (!id) {
        const { data } = await api.post('/expenses', { siteId, ...buildPayload(), idempotencyKey });
        id = data.expense._id;
        setExpenseId(id);
        setVersion(data.expense.version);
      } else {
        const { data } = await api.patch(`/expenses/${id}`, { ...buildPayload(), expectedVersion: version });
        setVersion(data.expense.version);
      }
      savedSnapshotRef.current = serialize(form);
      await doSubmit(id);
      await Swal.fire({ icon: 'success', title: 'Expense submitted', text: 'It is now pending approval.', confirmButtonColor: 'var(--theme-primary)' });
      onSaved?.();
    } catch (err) {
      if (apiErrorCode(err) === 'POSSIBLE_DUPLICATE') {
        const matches = apiErrorDetails(err)?.matches || [];
        const { value: reason } = await Swal.fire({
          icon: 'warning',
          title: 'Possible duplicate expense',
          html: `A very similar expense already exists (${matches.map((m) => m.expenseNumber).join(', ')}).<br/>Enter a reason to continue anyway, or cancel to review.`,
          input: 'text',
          inputPlaceholder: 'Reason to proceed anyway',
          showCancelButton: true,
          confirmButtonText: 'Submit anyway',
          confirmButtonColor: 'var(--theme-primary)',
          inputValidator: (v) => (!v ? 'A reason is required to override' : undefined),
        });
        if (reason && expenseId) {
          try {
            await doSubmit(expenseId, reason);
            await Swal.fire({ icon: 'success', title: 'Expense submitted', confirmButtonColor: 'var(--theme-primary)' });
            onSaved?.();
          } catch (err2) {
            setBanner(apiErrorMessage(err2));
          }
        }
      } else {
        setBanner(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !expenseId) return;
    setUploading(true);
    setBanner('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.post(`/expenses/${expenseId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadAttachments(expenseId);
    } catch (err) {
      setBanner(apiErrorMessage(err));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeAttachment = async (attachmentId) => {
    if (!expenseId) return;
    await api.delete(`/expenses/${expenseId}/attachments/${attachmentId}`);
    await loadAttachments(expenseId);
  };

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      icon={Receipt}
      title={isEdit ? `Edit Expense ${editExpense.expenseNumber}` : 'Add Expense'}
      subtitle={site?.name}
      width="lg"
      confirmBeforeClose={confirmBeforeClose}
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <DrawerCancelButton onClick={async () => (await confirmBeforeClose()) && onClose()} />
          <button type="button" onClick={saveDraft} disabled={saving || submitting} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
            {saving && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}Save Draft
          </button>
          <button type="button" onClick={submitExpense} disabled={saving || submitting} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Submit Expense
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {banner && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> <span>{banner}</span>
          </div>
        )}

        {balance && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[13px] dark:border-gray-700 dark:bg-gray-900/40">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Balance before</p>
              <p className="font-bold text-gray-900 dark:text-white">{paiseToInr(balance.available)}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Projected after</p>
              <p className={`font-bold ${projectedAfter < 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{amountPaise > 0 ? paiseToInr(projectedAfter) : '—'}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <ThemedDatePicker compact label="Expense Date" required value={form.expenseDate} max={toDateInputValue(new Date())} onChange={(v) => setForm((f) => ({ ...f, expenseDate: v }))} error={errors.expenseDate} />
          <ThemedSelect
            compact
            label="Category"
            required
            value={form.categoryId}
            onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            options={(categories || []).map((c) => ({ value: c._id, label: c.name }))}
            error={errors.categoryId}
          />
        </div>

        <div>
          <label className={fieldLabelClass}>
            Description / Purpose <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={2}
            placeholder="e.g. Milk, tea and biscuits for pantry"
            className={fieldTextareaClass(!!errors.description)}
          />
          {errors.description && <p className={fieldErrorClass}>{errors.description}</p>}
        </div>

        <div>
          <label className={fieldLabelClass}>Merchant / Payee</label>
          <input type="text" value={form.merchant} onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))} className={fieldInputClass(false)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={fieldLabelClass}>
              Amount (₹) <span className="text-red-500">*</span>
            </label>
            <input type="text" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={fieldInputClass(!!errors.amount)} />
            {errors.amount && <p className={fieldErrorClass}>{errors.amount}</p>}
          </div>
          <ThemedSelect
            compact
            label="Payment Mode"
            required
            value={form.paymentMode}
            onChange={(v) => setForm((f) => ({ ...f, paymentMode: v }))}
            options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Paid By</label>
          <input disabled value={user?.name || ''} className="h-9 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-2.5 text-[13px] text-gray-500 opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" />
        </div>

        <div>
          <label className={fieldLabelClass}>Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={fieldTextareaClass(false)} />
        </div>

        <div>
          <label className={fieldLabelClass}>Receipt</label>
          {!expenseId ? (
            <p className="text-[11px] text-gray-400">Save as draft first to attach a receipt.</p>
          ) : (
            <div className="space-y-2">
              {attachments.map((a) => (
                <div key={a._id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-[13px] dark:border-gray-700">
                  <a href={`/api/expenses/${expenseId}/attachments/${a._id}`} target="_blank" rel="noreferrer" className="theme-text flex items-center gap-2 truncate hover:underline">
                    <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{a.originalName}</span>
                  </a>
                  <button type="button" onClick={() => removeAttachment(a._id)} aria-label="Remove attachment" className="text-gray-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <label className="theme-nav-hover flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-[13px] text-gray-500 dark:border-gray-600">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Upload receipt (JPG, PNG, PDF)'}
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={onFileSelected} />
              </label>
            </div>
          )}
        </div>
      </div>
    </DrawerShell>
  );
}
