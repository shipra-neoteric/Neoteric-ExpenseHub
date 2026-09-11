export const PERMISSIONS = Object.freeze({
  VIEW: 'site_expense.view',
  CREATE: 'site_expense.create',
  EDIT_OWN_DRAFT: 'site_expense.edit_own_draft',
  SUBMIT: 'site_expense.submit',
  APPROVE: 'site_expense.approve',
  REJECT_RETURN: 'site_expense.reject_return',
  VOID: 'site_expense.void',
  FUND_VIEW: 'site_expense.fund_view',
  FUND_MANAGE: 'site_expense.fund_manage',
  REPORT_EXPORT: 'site_expense.report_export',
  MASTER_MANAGE: 'site_expense.master_manage',
  USER_SCOPE_MANAGE: 'site_expense.user_scope_manage',
  VIEW_ALL_SITES: 'site_expense.view_all_sites',
});

// Colors follow UI_STYLE_GUIDE.md section 3.4's exact badge pattern
// (bg-{c}-100 text-{c}-700 dark:bg-{c}-900/30 dark:text-{c}-300) and semantic
// legend: amber=pending, green=success/complete, red=rejected, gray/slate=neutral,
// orange=needs-attention/returned.
export const STATUS_META = {
  DRAFT: { label: 'Draft', dot: 'bg-gray-400', pill: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  PENDING_APPROVAL: { label: 'Pending Approval', dot: 'bg-amber-500', pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  RETURNED: { label: 'Returned', dot: 'bg-orange-500', pill: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  APPROVED: { label: 'Approved', dot: 'bg-green-500', pill: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  REJECTED: { label: 'Rejected', dot: 'bg-red-500', pill: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  VOIDED: { label: 'Voided', dot: 'bg-slate-500', pill: 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300' },
};

export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'];
export const PAYMENT_MODE_LABELS = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', BANK_TRANSFER: 'Bank Transfer', OTHER: 'Other' };
