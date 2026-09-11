import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import ThemedSelect from '../common/ThemedSelect';
import { fieldLabelClass, fieldInputClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import { useTheme } from '../../theme/ThemeContext';
import api, { apiErrorMessage } from '../../api/client';
import { ROLE_PRESET_OPTIONS } from '../../pages/roleOptions';

const emptyForm = { name: '', email: '', password: '', roleLabel: 'FRONT_DESK_EXECUTIVE' };

export default function UserDrawer({ open, onClose, onSaved }) {
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
    if (!form.name.trim()) e.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.password.length < 8) e.password = 'At least 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      await api.post('/users', { name: form.name.trim(), email: form.email.trim(), password: form.password, roleLabel: form.roleLabel });
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
      icon={UserPlus}
      title="New User"
      subtitle="Create a user and assign a role"
      width="lg"
      footer={
        <>
          <DrawerCancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create User
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {banner && <p className="text-[13px] text-red-500">{banner}</p>}
        <div>
          <label className={fieldLabelClass}>
            Full Name <span className="text-red-500">*</span>
          </label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={fieldInputClass(!!errors.name)} />
          {errors.name && <p className={fieldErrorClass}>{errors.name}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>
            Email <span className="text-red-500">*</span>
          </label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={fieldInputClass(!!errors.email)} />
          {errors.email && <p className={fieldErrorClass}>{errors.email}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>
            Temporary Password <span className="text-red-500">*</span>
          </label>
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" className={fieldInputClass(!!errors.password)} />
          {errors.password && <p className={fieldErrorClass}>{errors.password}</p>}
        </div>
        <ThemedSelect compact label="Role" required value={form.roleLabel} onChange={(v) => setForm((f) => ({ ...f, roleLabel: v }))} options={ROLE_PRESET_OPTIONS} />
      </div>
    </DrawerShell>
  );
}
