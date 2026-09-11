import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { UploadCloud, Loader2, AlertTriangle } from 'lucide-react';
import api, { apiErrorMessage } from '../../api/client';
import { paiseToInr } from '../../utils/format';
import { useTheme } from '../../theme/ThemeContext';

export default function ImportTab() {
  const { getThemeColor } = useTheme();
  const [file, setFile] = useState(null);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runDryRun = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    setDryRunResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/imports/dry-run', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setDryRunResult(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const runCommit = async () => {
    if (!file) return;
    const ok = await Swal.fire({
      title: 'Commit this import?',
      text: `${dryRunResult?.accepted.length || 0} row(s) will be posted as approved expenses. Rejected rows will not be imported.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Commit',
      confirmButtonColor: 'var(--theme-primary)',
    });
    if (!ok.isConfirmed) return;
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/imports/commit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await Swal.fire({
        icon: 'success',
        title: 'Import complete',
        html: `Imported: ${data.imported}<br/>Rejected: ${data.rejected}<br/>Already imported (skipped): ${data.alreadyImported}<br/>Possible duplicates flagged: ${data.possibleDuplicates}<br/>Imported total: ${paiseToInr(data.importedTotalPaise)}`,
        confirmButtonColor: 'var(--theme-primary)',
      });
      setDryRunResult(null);
      setFile(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        Upload a CSV with columns <code>site, expenseDate, category, description, amount</code> (optional:
        <code> merchant, paymentMode, notes, legacyRowRef</code>). Rows with a blank/invalid amount, unknown
        site/category, or an ambiguous date are never guessed at — they are rejected for manual review. Always
        run Dry Run first.
      </div>

      <div className="flex items-center gap-3">
        <label className="theme-nav-hover flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-300">
          <UploadCloud className="h-4 w-4" />
          {file ? file.name : 'Choose CSV file'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setDryRunResult(null); }} />
        </label>
        <button
          onClick={runDryRun}
          disabled={!file || loading}
          className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />} Dry Run
        </button>
        {dryRunResult && (
          <button onClick={runCommit} disabled={loading} style={{ backgroundColor: getThemeColor() }} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50">
            Commit Import
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {dryRunResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Accepted" value={dryRunResult.accepted.length} tone="green" />
            <Stat label="Rejected" value={dryRunResult.rejected.length} tone="red" />
            <Stat label="Accepted Total" value={paiseToInr(dryRunResult.acceptedTotalPaise)} />
          </div>

          {dryRunResult.rejected.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200">
                <AlertTriangle className="h-4 w-4 text-amber-500" /> Rows needing review
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-2">Row</th>
                    <th className="px-4 py-2">Raw Data</th>
                    <th className="px-4 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {dryRunResult.rejected.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-4 py-2 text-gray-500">{r.rowNumber}</td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{Object.values(r.raw).filter(Boolean).join(' / ') || '(empty row)'}</td>
                      <td className="px-4 py-2 text-red-500">{r.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const toneClass = tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-red-500' : 'text-gray-900 dark:text-white';
  return (
    <div className="rounded-lg bg-white p-3 shadow dark:bg-gray-800 sm:p-4">
      <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">{label}</p>
      <p className={`mt-2 text-2xl font-medium sm:text-3xl ${toneClass}`}>{value}</p>
    </div>
  );
}
