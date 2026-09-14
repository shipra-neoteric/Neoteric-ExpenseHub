const PERMISSIONS = Object.freeze({
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

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Role presets map to permission bundles. Authorization checks always test the
// permission array on the user, never the role name, so these are just seed defaults.
const ROLE_PRESETS = Object.freeze({
  FRONT_DESK_EXECUTIVE: [
    PERMISSIONS.VIEW,
    PERMISSIONS.CREATE,
    PERMISSIONS.EDIT_OWN_DRAFT,
    PERMISSIONS.SUBMIT,
  ],
  SITE_APPROVER: [
    PERMISSIONS.VIEW,
    PERMISSIONS.APPROVE,
    PERMISSIONS.REJECT_RETURN,
    PERMISSIONS.REPORT_EXPORT,
  ],
  // AGM is the current approver role going forward — same permission bundle
  // as SITE_APPROVER (single approval step). Kept as a distinct preset label
  // rather than renaming SITE_APPROVER so existing seeded/assigned users are
  // unaffected; Master can assign either label to new users.
  AGM: [
    PERMISSIONS.VIEW,
    PERMISSIONS.APPROVE,
    PERMISSIONS.REJECT_RETURN,
    PERMISSIONS.REPORT_EXPORT,
  ],
  FINANCE: [
    PERMISSIONS.VIEW,
    PERMISSIONS.FUND_VIEW,
    PERMISSIONS.FUND_MANAGE,
    PERMISSIONS.REPORT_EXPORT,
  ],
  MASTER_ADMIN: ALL_PERMISSIONS,
});

const EXPENSE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  RETURNED: 'RETURNED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  VOIDED: 'VOIDED',
});

const FUND_PERIOD_STATUS = Object.freeze({
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
});

const LEDGER_ENTRY_TYPE = Object.freeze({
  OPENING_ALLOCATION: 'OPENING_ALLOCATION',
  TOP_UP: 'TOP_UP',
  EXPENSE_POSTED: 'EXPENSE_POSTED',
  EXPENSE_REVERSAL: 'EXPENSE_REVERSAL',
  ADJUSTMENT: 'ADJUSTMENT',
  CARRY_FORWARD: 'CARRY_FORWARD',
});

const PAYMENT_MODES = Object.freeze(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER']);

const RECEIPT_RULE = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  REQUIRED: 'REQUIRED',
  REQUIRED_ABOVE_THRESHOLD: 'REQUIRED_ABOVE_THRESHOLD',
});

const OVERDRAW_BEHAVIOR = Object.freeze({
  BLOCK: 'BLOCK',
  ALLOW_WITH_APPROVAL: 'ALLOW_WITH_APPROVAL',
});

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  ROLE_PRESETS,
  EXPENSE_STATUS,
  FUND_PERIOD_STATUS,
  LEDGER_ENTRY_TYPE,
  PAYMENT_MODES,
  RECEIPT_RULE,
  OVERDRAW_BEHAVIOR,
};
