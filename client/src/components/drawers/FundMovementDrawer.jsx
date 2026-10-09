import React, { useEffect, useState } from 'react';
import { Loader2, ArrowUpCircle, Sliders, UploadCloud, FileText, X } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import { fieldLabelClass, fieldInputClass, fieldTextareaClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import { useTheme } from '../../theme/ThemeContext';
import api, { apiErrorMessage } from '../../api/client';

const emptyForm = { amount: '', reason: '', paidToName: '' };

// mode: 'topup' (always adds funds, optional payment-proof upload) |
// 'adjustment' (signed, Add/Deduct toggle, no proof — it's a correction, not
// a real-world payment). `initialAmount`/`initialReason` prefill the form —
// used by the Monthly Transfers page, which already knows exactly how much
// is owed to each site.
export default function FundMovementDrawer({ open, onClose, periodId, siteName, mode, initialAmount, initialReason, onSaved }) {
  const { getThemeColor } = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [direction, setDirection] = useState('add');
  const [proofFile, setProofFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState('');

  const isAdjustment = mode === 'adjustment';

  useEffect(() => {
    if (open) {
      setForm({ amount: initialAmount || '', reason: initialReason || '', paidToName: '' });
      setDirection('add');
      setProofFile(null);
      setErrors({});
      setBanner('');
    }
  }, [open, initialAmount, initialReason]);

  const validate = () => {
    const e = {};
    const n = parseFloat(form.amount);
    if (!form.amount || !Number.isFinite(n) || n <= 0) e.amount = 'Enter a valid amount greater than zero';
    if (!form.reason.trim() || form.reason.trim().length < 3) e.reason = 'A reason is required';
    if (!isAdjustment && !form.paidToName.trim()) e.paidToName = 'Who was paid is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      if (isAdjustment) {
        const amount = direction === 'deduct' ? `-${form.amount}` : form.amount;
        await api.post(`/funds/periods/${periodId}/adjustment`, { amount, reason: form.reason.trim() });
      } else {
        const fd = new FormData();
        fd.append('amount', form.amount);
        fd.append('reason', form.reason.trim());
        fd.append('paidToName', form.paidToName.trim());
        if (proofFile) fd.append('file', proofFile);
        await api.post(`/funds/periods/${periodId}/top-up`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onSaved?.();
    } catch (err) {
      setBanner(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      icon={isAdjustment ? Sliders : ArrowUpCircle}
      title={isAdjustment ? 'Fund Adjustment' : 'Add Top-up'}
      subtitle={siteName}
      width="lg"
      footer={
        <>
          <DrawerCancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {isAdjustment ? 'Apply Adjustment' : 'Add Top-up'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {banner && <p className="text-[13px] text-red-500">{banner}</p>}

        {isAdjustment && (
          <div>
            <label className={fieldLabelClass}>Direction</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('add')}
                className={`h-9 rounded-lg border text-[13px] font-medium transition ${
                  direction === 'add' ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                Add funds
              </button>
              <button
                type="button"
                onClick={() => setDirection('deduct')}
                className={`h-9 rounded-lg border text-[13px] font-medium transition ${
                  direction === 'deduct' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                Deduct funds
              </button>
            </div>
          </div>
        )}

        <div>
          <label className={fieldLabelClass}>
            Amount (₹) <span className="text-red-500">*</span>
          </label>
          <input type="text" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={fieldInputClass(!!errors.amount)} />
          {errors.amount && <p className={fieldErrorClass}>{errors.amount}</p>}
        </div>

        {!isAdjustment && (
          <div>
            <label className={fieldLabelClass}>
              Paid To (Name) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.paidToName}
              onChange={(e) => setForm((f) => ({ ...f, paidToName: e.target.value }))}
              placeholder="e.g. Palak Jhariya (Front Desk)"
              className={fieldInputClass(!!errors.paidToName)}
            />
            {errors.paidToName && <p className={fieldErrorClass}>{errors.paidToName}</p>}
          </div>
        )}

        <div>
          <label className={fieldLabelClass}>
            Reason <span className="text-red-500">*</span>
          </label>
          <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className={fieldTextareaClass(!!errors.reason)} />
          {errors.reason && <p className={fieldErrorClass}>{errors.reason}</p>}
        </div>

        {!isAdjustment && (
          <div>
            <label className={fieldLabelClass}>Payment proof (optional)</label>
            {proofFile ? (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-[13px] dark:border-gray-700">
                <span className="flex items-center gap-2 truncate">
                  <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{proofFile.name}</span>
                </span>
                <button type="button" onClick={() => setProofFile(null)} aria-label="Remove file" className="text-gray-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="theme-nav-hover flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-[13px] text-gray-500 dark:border-gray-600">
                <UploadCloud className="h-4 w-4" />
                Upload a screenshot/receipt of the transfer (JPG, PNG, PDF)
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
              </label>
            )}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
