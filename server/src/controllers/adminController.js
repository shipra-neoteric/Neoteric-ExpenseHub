const asyncHandler = require('../utils/asyncHandler');
const monthlyRolloverJob = require('../services/monthlyRolloverJob');
const monthEndSummaryJob = require('../services/monthEndSummaryJob');
const Expense = require('../models/Expense');
const ExpenseAttachment = require('../models/ExpenseAttachment');
const ExpenseApprovalAction = require('../models/ExpenseApprovalAction');
const AuditEvent = require('../models/AuditEvent');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const ApiError = require('../utils/ApiError');
const cloudinary = require('../config/cloudinary');

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
      const resourceType = att.mimeType === 'application/pdf' ? 'raw' : 'image';
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

module.exports = {
  runMonthlyRolloverForAllOrganizations,
  runMonthEndSummaryForAllOrganizations,
  deleteTestExpense,
};
