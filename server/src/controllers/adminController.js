const asyncHandler = require('../utils/asyncHandler');
const monthlyRolloverJob = require('../services/monthlyRolloverJob');
const monthEndSummaryJob = require('../services/monthEndSummaryJob');
const Expense = require('../models/Expense');
const ExpenseAttachment = require('../models/ExpenseAttachment');
const ExpenseApprovalAction = require('../models/ExpenseApprovalAction');
const AuditEvent = require('../models/AuditEvent');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const Site = require('../models/Site');
const ApiError = require('../utils/ApiError');
const cloudinary = require('../config/cloudinary');
const fundService = require('../services/fundService');
const { EXPENSE_STATUS } = require('../config/constants');

// Manual/external-cron entry point only — the automatic in-app trigger was
// removed (see app.js) now that Finance sends each site's top-up by hand via
// the Monthly Transfers page. Still here for whoever wants to run it
// on-demand, or wire up an external scheduler.
const runMonthlyRolloverForAllOrganizations = asyncHandler(async (req, res) => {
  const result = await monthlyRolloverJob.runMonthlyRolloverForAllOrganizations();
  res.json(result);
});

// Kept as a manual/external-cron entry point alongside the opportunistic
// in-app trigger in monthEndSummaryJob — handy for an on-demand resend or a
// deployment that prefers an explicit scheduler. `?force=true` bypasses the
// last-day-of-month gate for testing.
const runMonthEndSummaryForAllOrganizations = asyncHandler(async (req, res) => {
  const result = await monthEndSummaryJob.runMonthEndSummaryForAllOrganizations({
    force: req.query.force === 'true',
    siteName: req.query.site || null,
  });
  res.json(result);
});

// One-time cleanup: deletes a single test expense by its expenseNumber,
// including its Cloudinary receipt(s), attachment records, approval
// actions, audit events, and the EXPENSE_POSTED/EXPENSE_REVERSAL ledger
// entries it posted (so the site's balance reflects the removal). Safe to
// call more than once — no-ops once the expense is gone.
const deleteTestExpense = asyncHandler(async (req, res) => {
  const { expenseNumber } = req.query;
  if (!expenseNumber) throw ApiError.badRequest('expenseNumber query param is required', 'EXPENSE_NUMBER_REQUIRED');

  const expense = await Expense.findOne({ expenseNumber });
  if (!expense) return res.json({ skipped: true, reason: 'NOT_FOUND' });

  const attachments = await ExpenseAttachment.find({ expenseId: expense._id });
  for (const att of attachments) {
    if (att.publicId) {
      const resourceType = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(att.mimeType) ? 'image' : 'raw';
      await cloudinary.uploader.destroy(att.publicId, { resource_type: resourceType }).catch(() => {});
    }
  }
  await ExpenseAttachment.deleteMany({ expenseId: expense._id });
  await ExpenseApprovalAction.deleteMany({ expenseId: expense._id });
  await AuditEvent.deleteMany({ entityType: 'Expense', entityId: expense._id });
  await FundLedgerEntry.deleteMany({ relatedExpenseId: expense._id });
  await Expense.deleteOne({ _id: expense._id });

  res.json({ fixed: true, deletedExpenseNumber: expenseNumber, attachmentsRemoved: attachments.length });
});

// One-time rename: history (expenses, ledger, reports) all stay linked by
// siteId, so renaming the Site document is purely cosmetic and doesn't
// affect any balance/calculation. Safe to call more than once — no-ops once
// the site already has the new name.
const renameSite = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) throw ApiError.badRequest('from and to query params are required', 'SITE_NAMES_REQUIRED');

  const site = await Site.findOne({ name: from });
  if (!site) {
    const already = await Site.findOne({ name: to });
    if (already) return res.json({ skipped: true, reason: 'ALREADY_RENAMED' });
    throw ApiError.notFound(`Site "${from}" not found`);
  }

  site.name = to;
  await site.save();
  res.json({ fixed: true, siteId: site._id, name: site.name });
});

// Read-only: reports a site's open-period balance and any pending/returned
// expenses blocking a close, so a close-and-migrate can be planned with real
// numbers instead of guessing. Not a mutation — safe to call anytime.
const siteStatus = asyncHandler(async (req, res) => {
  const { site: siteName } = req.query;
  if (!siteName) throw ApiError.badRequest('site query param is required', 'SITE_REQUIRED');
  const site = await Site.findOne({ name: siteName });
  if (!site) throw ApiError.notFound(`Site "${siteName}" not found`);

  const account = await fundService.getActiveFundAccount(site._id, site.organizationId);
  const period = account && (await fundService.getOpenPeriod(account._id));
  const balance = period ? await fundService.computeBalance(period._id) : null;

  const blockingExpenses = await Expense.find({
    siteId: site._id,
    status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.RETURNED] },
  })
    .select('expenseNumber status amountPaise description')
    .lean();

  res.json({
    siteId: site._id,
    siteStatus: site.status,
    fundAccountStatus: account?.status || null,
    periodId: period?._id || null,
    periodLabel: period?.label || null,
    balance,
    blockingExpenses,
  });
});

module.exports = {
  runMonthlyRolloverForAllOrganizations,
  runMonthEndSummaryForAllOrganizations,
  deleteTestExpense,
  renameSite,
  siteStatus,
};
