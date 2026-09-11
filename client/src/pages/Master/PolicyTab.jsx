import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import ThemedSelect from '../../components/common/ThemedSelect';
import { OVERDRAW_BEHAVIOR_OPTIONS } from './masterConstants';
import { PAYMENT_MODES, PAYMENT_MODE_LABELS } from '../../utils/permissions';
import { useTheme } from '../../theme/ThemeContext';

const emptyForm = {
  defaultAllocationAmount: '',
  overdrawBehavior: 'BLOCK',
  receiptRequiredThresholdAmount: '',
  backdateLimitDays: 7,
  allowedPaymentModes: [...PAYMENT_MODES],
  allowSelfApproval: false,
  approverUserIds: [],
};

export default function PolicyTab({ sites }) {
  const { getThemeColor } = useTheme();
  const [siteId, setSiteId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/users').then(({ data }) => setUsers(data.items));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setMessage('');
      try {
        const { data } = await api.get('/policies', { params: siteId ? { siteId } : {} });
        if (data.policy) {
          setForm({
            defaultAllocationAmount: (data.policy.defaultAllocationPaise / 100).toString(),
            overdrawBehavior: data.policy.overdrawBehavior,
            receiptRequiredThresholdAmount: data.policy.receiptRequiredThresholdPaise != null ? (data.policy.receiptRequiredThresholdPaise / 100).toString() : '',
            backdateLimitDays: data.policy.backdateLimitDays,
            allowedPaymentModes: data.policy.allowedPaymentModes,
            allowSelfApproval: data.policy.allowSelfApproval,
            approverUserIds: (data.policy.approverUserIds || []).map(String),
          });
        } else {
          setForm(emptyForm);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [siteId]);

  const togglePaymentMode = (mode) => {
    setForm((f) => ({
      ...f,
      allowedPaymentModes: f.allowedPaymentModes.includes(mode) ? f.allowedPaymentModes.filter((m) => m !== mode) : [...f.allowedPaymentModes, mode],
    }));
  };

  const toggleApprover = (userId) => {
    setForm((f) => ({
      ...f,
      approverUserIds: f.approverUserIds.includes(userId) ? f.approverUserIds.filter((id) => id !== userId) : [...f.approverUserIds, userId],
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.put('/policies', {
        siteId: siteId || null,
        defaultAllocationAmount: form.defaultAllocationAmount || '0',
        overdrawBehavior: form.overdrawBehavior,
        receiptRequiredThresholdAmount: form.receiptRequiredThresholdAmount || undefined,
        backdateLimitDays: Number(form.backdateLimitDays),
        allowedPaymentModes: form.allowedPaymentModes,
        allowSelfApproval: form.allowSelfApproval,
        approverUserIds: form.approverUserIds,
      });
      setMessage('Policy saved.');
    } catch (err) {
      setMessage(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <ThemedSelect
        label="Scope"
        value={siteId}
        onChange={setSiteId}
        options={sites.map((s) => ({ value: s._id, label: s.name }))}
        placeholder="Organization Default"
      />
      <p className="text-xs text-gray-400">
        A site-specific policy fully overrides the organization default for that site. Leave scope empty to edit the org-wide default.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading policy…
        </div>
      ) : (
        <>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Allocation (₹)</label>
            <input value={form.defaultAllocationAmount} onChange={(e) => setForm((f) => ({ ...f, defaultAllocationAmount: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <ThemedSelect label="Overdraw Behavior" value={form.overdrawBehavior} onChange={(v) => setForm((f) => ({ ...f, overdrawBehavior: v }))} options={OVERDRAW_BEHAVIOR_OPTIONS} />
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Receipt Required Above (₹, blank = category rules only)</label>
            <input value={form.receiptRequiredThresholdAmount} onChange={(e) => setForm((f) => ({ ...f, receiptRequiredThresholdAmount: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Backdate Limit (days)</label>
            <input type="number" min={0} value={form.backdateLimitDays} onChange={(e) => setForm((f) => ({ ...f, backdateLimitDays: e.target.value }))} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Allowed Payment Modes</label>
            <div className="mt-1 flex flex-wrap gap-3">
              {PAYMENT_MODES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={form.allowedPaymentModes.includes(m)} onChange={() => togglePaymentMode(m)} /> {PAYMENT_MODE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={form.allowSelfApproval} onChange={(e) => setForm((f) => ({ ...f, allowSelfApproval: e.target.checked }))} />
              Allow self-approval (not recommended)
            </label>
          </div>
          {siteId && (
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Approvers for this site</label>
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                {users.map((u) => (
                  <label key={u._id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={form.approverUserIds.includes(u._id)} onChange={() => toggleApprover(u._id)} /> {u.name} <span className="text-xs text-gray-400">({u.email})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {message && <p className="theme-text text-sm">{message}</p>}
          <button onClick={save} disabled={saving} style={{ backgroundColor: getThemeColor() }} className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Policy
          </button>
        </>
      )}
    </div>
  );
}
