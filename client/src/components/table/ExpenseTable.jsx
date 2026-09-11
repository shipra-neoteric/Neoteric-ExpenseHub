import React from 'react';
import { Paperclip, AlertCircle, Loader2 } from 'lucide-react';
import StatusPill from '../common/StatusPill';
import { paiseToInr, formatDate } from '../../utils/format';

export default function ExpenseTable({ items, loading, error, onRowClick }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading expenses…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-red-500">
        <AlertCircle className="h-6 w-6" />
        <p>{error}</p>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-16 text-gray-400">
        <p className="font-medium">No expenses found</p>
        <p className="text-sm">Try adjusting your filters, or add a new expense.</p>
      </div>
    );
  }

  return (
    <div className="custom-horizontal-scrollbar overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <tr>
            <th className="px-3 py-3 text-left font-medium sm:px-6">Expense</th>
            <th className="px-3 py-3 text-left font-medium sm:px-6">Date</th>
            <th className="hidden px-3 py-3 text-left font-medium sm:table-cell sm:px-6">Category</th>
            <th className="px-3 py-3 text-left font-medium sm:px-6">Description / Merchant</th>
            <th className="hidden px-3 py-3 text-left font-medium lg:table-cell sm:px-6">Submitted By</th>
            <th className="px-3 py-3 text-right font-medium sm:px-6">Amount</th>
            <th className="hidden px-3 py-3 text-center font-medium sm:table-cell sm:px-6">Receipt</th>
            <th className="px-3 py-3 text-left font-medium sm:px-6">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {items.map((exp) => (
            <tr key={exp._id} onClick={() => onRowClick(exp)} className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-3 py-4 font-medium text-gray-900 dark:text-white sm:px-6">{exp.expenseNumber}</td>
              <td className="px-3 py-4 text-gray-600 dark:text-gray-300 sm:px-6">{formatDate(exp.expenseDate)}</td>
              <td className="hidden px-3 py-4 text-gray-600 dark:text-gray-300 sm:table-cell sm:px-6">{exp.categorySnapshot?.name}</td>
              <td className="px-3 py-4 text-gray-600 dark:text-gray-300 sm:px-6">
                <div className="max-w-[240px] truncate">{exp.description}</div>
                {exp.merchant && <div className="truncate text-xs text-gray-400">{exp.merchant}</div>}
              </td>
              <td className="hidden px-3 py-4 text-gray-600 dark:text-gray-300 lg:table-cell sm:px-6">{exp.createdBy?.name}</td>
              <td className="px-3 py-4 text-right font-bold text-gray-900 dark:text-white sm:px-6">{paiseToInr(exp.amountPaise)}</td>
              <td className="hidden px-3 py-4 text-center sm:table-cell sm:px-6">
                {exp.hasReceipt ? (
                  <Paperclip className="mx-auto h-4 w-4 text-green-600" aria-label="Receipt attached" />
                ) : (
                  <span className="text-xs text-gray-300" aria-label="No receipt">
                    —
                  </span>
                )}
              </td>
              <td className="px-3 py-4 sm:px-6">
                <StatusPill status={exp.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
