import React, { useEffect, useState } from 'react';
import { Loader2, Building2 } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import { fieldLabelClass, fieldInputClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import { useTheme } from '../../theme/ThemeContext';
import api, { apiErrorMessage } from '../../api/client';

const emptyForm = { code: '', name: '', salesOfficeLabel: '' };

export default function SiteDrawer({ open, onClose, onSaved }) {
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
    if (!form.code.trim()) e.code = 'Site code is required';
    if (!form.name.trim()) e.name = 'Site name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      await api.post('/sites', { code: form.code.trim(), name: form.name.trim(), salesOfficeLabel: form.salesOfficeLabel.trim() });
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
      icon={Building2}
      title="New Site"
      subtitle="Add a project/site to Site Expenses"
      width="lg"
      footer={
        <>
          <DrawerCancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Site
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {banner && <p className="text-[13px] text-red-500">{banner}</p>}
        <div>
          <label className={fieldLabelClass}>
            Site Code <span className="text-red-500">*</span>
          </label>
          <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. GARDEN-CITY" className={fieldInputClass(!!errors.code)} />
          {errors.code && <p className={fieldErrorClass}>{errors.code}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>
            Site Name <span className="text-red-500">*</span>
          </label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={fieldInputClass(!!errors.name)} />
          {errors.name && <p className={fieldErrorClass}>{errors.name}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>Sales Office Label</label>
          <input value={form.salesOfficeLabel} onChange={(e) => setForm((f) => ({ ...f, salesOfficeLabel: e.target.value }))} placeholder="Optional" className={fieldInputClass(false)} />
        </div>
      </div>
    </DrawerShell>
  );
}
