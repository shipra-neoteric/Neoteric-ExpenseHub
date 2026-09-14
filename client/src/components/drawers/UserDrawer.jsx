import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import DrawerShell, { DrawerCancelButton } from './DrawerShell';
import ThemedSelect from '../common/ThemedSelect';
import { fieldLabelClass, fieldInputClass, fieldErrorClass, primaryButtonClass } from './drawerFormStyles';
import { useTheme } from '../../theme/ThemeContext';
import api, { apiErrorMessage } from '../../api/client';
import { ROLE_PRESET_OPTIONS } from '../../pages/roleOptions';

const emptyForm = { name: '', email: '', password: '', roleLabel: 'FRONT_DESK_EXECUTIVE', slackEmail: '' };

// Reused for both "New User" (no editUser) and editing an existing one.
// Password is optional when editing — leave blank to keep the current one.
export default function UserDrawer({ open, onClose, onSaved, editUser }) {
  const { getThemeColor } = useTheme();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState('');

  const isEdit = !!editUser;

  useEffect(() => {
    if (open) {
      setForm(
        editUser
          ? { name: editUser.name, email: editUser.email, password: '', roleLabel: editUser.roleLabel, slackEmail: editUser.slackEmail || '' }
          : emptyForm
      );
      setErrors({});
      setBanner('');
    }
  }, [open, editUser]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!isEdit && form.password.length < 8) e.password = 'At least 8 characters';
    if (isEdit && form.password && form.password.length < 8) e.password = 'At least 8 characters';
    if (form.slackEmail && !/^\S+@\S+\.\S+$/.test(form.slackEmail)) e.slackEmail = 'Enter a valid email';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setBanner('');
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        roleLabel: form.roleLabel,
        slackEmail: form.slackEmail.trim() || null,
      };
      if (form.password) payload.password = form.password;
      if (isEdit) {
        await api.patch(`/users/${editUser._id}`, payload);
      } else {
        await api.post('/users', { ...payload, password: form.password });
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
      icon={UserPlus}
      title={isEdit ? `Edit ${editUser.name}` : 'New User'}
      subtitle={isEdit ? 'Update user details, role, or password' : 'Create a user and assign a role'}
      width="lg"
      footer={
        <>
          <DrawerCancelButton onClick={onClose} />
          <button type="button" onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className={primaryButtonClass}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {isEdit ? 'Save Changes' : 'Create User'}
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
            Login Email <span className="text-red-500">*</span>
          </label>
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className={fieldInputClass(!!errors.email)} />
          {errors.email && <p className={fieldErrorClass}>{errors.email}</p>}
        </div>
        <div>
          <label className={fieldLabelClass}>
            {isEdit ? 'Reset Password' : 'Temporary Password'} {!isEdit && <span className="text-red-500">*</span>}
          </label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={isEdit ? 'Leave blank to keep current password' : 'Min 8 characters'}
            className={fieldInputClass(!!errors.password)}
          />
          {errors.password && <p className={fieldErrorClass}>{errors.password}</p>}
        </div>
        <ThemedSelect compact label="Role" required value={form.roleLabel} onChange={(v) => setForm((f) => ({ ...f, roleLabel: v }))} options={ROLE_PRESET_OPTIONS} />
        <div>
          <label className={fieldLabelClass}>Slack Email (for AGM approval DMs)</label>
          <input
            type="email"
            value={form.slackEmail}
            onChange={(e) => setForm((f) => ({ ...f, slackEmail: e.target.value }))}
            placeholder="Optional — the email this person uses on Slack"
            className={fieldInputClass(!!errors.slackEmail)}
          />
          {errors.slackEmail && <p className={fieldErrorClass}>{errors.slackEmail}</p>}
        </div>
      </div>
    </DrawerShell>
  );
}
