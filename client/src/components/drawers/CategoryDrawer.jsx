import React, { useEffect, useState } from 'react';
import { Loader2, Tag } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import { fieldLabelClass, fieldInputClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import { useTheme } from '../../theme/ThemeContext';
import api, { apiErrorMessage } from '../../api/client';

const emptyForm = { name: '', code: '' };

export default function CategoryDrawer({ open, onClose, onSaved }) {
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
    if (!form.name.trim()) e.name = 'Category name is required';
    if (!form.code.trim()) e.code = 'Category code is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      await api.post('/categories', { name: form.name.trim(), code: form.code.trim() });
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
      icon={Tag}
      title="New Expense Category"
      subtitle="Add a category front desk staff can select"
      width="lg"
      footer={
        <>
          <DrawerCancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Category
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {banner && <p className="text-[13px] text-red-500">{banner}</p>}
        <div>
          <label className={fieldLabelClass}>
            Category Name <span className="text-red-500">*</span>
          </label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={fieldInputClass(!!errors.name)} />
          {errors.name && <p className={fieldErrorClass}>{errors.name}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>
            Category Code <span className="text-red-500">*</span>
          </label>
          <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="e.g. PANTRY" className={fieldInputClass(!!errors.code)} />
          {errors.code && <p className={fieldErrorClass}>{errors.code}</p>}
        </div>
        <p className="text-[11px] text-gray-400">Receipt rule and display order can be adjusted from the category list after it's created.</p>
      </div>
    </DrawerShell>
  );
}
