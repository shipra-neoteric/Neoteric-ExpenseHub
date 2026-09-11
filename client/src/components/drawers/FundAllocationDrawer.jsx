import React, { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import { fieldLabelClass, fieldInputClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import { useTheme } from '../../theme/ThemeContext';
import api, { apiErrorMessage } from '../../api/client';

const emptyForm = { label: '', amount: '' };

export default function FundAllocationDrawer({ open, onClose, siteId, siteName, onSaved }) {
  const { getThemeColor } = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState('');

  useEffect(() => {
    if (open) {
      setForm(emptyForm);
      setErrors({});
      setBanner('');
    }
  }, [open]);

  const validate = () => {
    const e = {};
    if (!form.label.trim()) e.label = 'Period label is required';
    const n = parseFloat(form.amount);
    if (!form.amount || !Number.isFinite(n) || n <= 0) e.amount = 'Enter a valid amount greater than zero';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      await api.post('/funds/opening-allocation', { siteId, label: form.label.trim(), amount: form.amount });
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
      icon={Wallet}
      title="Open New Fund Period"
      subtitle={siteName}
      width="lg"
      footer={
        <>
          <DrawerCancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Allocation
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {banner && <p className="text-[13px] text-red-500">{banner}</p>}
        <div>
          <label className={fieldLabelClass}>
            Period Label <span className="text-red-500">*</span>
          </label>
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. 2026-09" className={fieldInputClass(!!errors.label)} />
          {errors.label && <p className={fieldErrorClass}>{errors.label}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>
            Opening Amount (₹) <span className="text-red-500">*</span>
          </label>
          <input type="text" inputMode="decimal" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className={fieldInputClass(!!errors.amount)} />
          {errors.amount && <p className={fieldErrorClass}>{errors.amount}</p>}
        </div>
      </div>
    </DrawerShell>
  );
}
