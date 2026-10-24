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
const User = require('../models/User');
const SiteUserAssignment = require('../models/SiteUserAssignment');
const { EXPENSE_STATUS, PERMISSIONS } = require('../config/constants');

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

// One-time: closes `fromSite`'s open fund period without carrying its
// balance forward (so its history stays frozen exactly where it is),
// deactivates `fromSite`, creates a brand-new `toSite`/`toCode` with no
// history, opens its fund account/period with that leftover balance as an
// opening allocation, and moves `managerEmail`'s site assignment from
// `fromSite` to the new site. Safe to call more than once — later calls
// no-op the steps already done (site already inactive, new site already
// exists, etc.), though a re-run after the opening allocation went through
// will skip it even if the amount differs — this is meant for a single,
// reviewed run.
const closeSiteAndMigrate = asyncHandler(async (req, res) => {
  const { fromSite: fromSiteName, toSite: toSiteName, toCode, managerEmail } = req.query;
  if (!fromSiteName || !toSiteName || !toCode || !managerEmail) {
    throw ApiError.badRequest('fromSite, toSite, toCode, and managerEmail query params are required', 'PARAMS_REQUIRED');
  }

  const fromSite = await Site.findOne({ name: fromSiteName });
  if (!fromSite) throw ApiError.notFound(`Site "${fromSiteName}" not found`);

  const actor = await User.findOne({ organizationId: fromSite.organizationId, isActive: true, permissions: PERMISSIONS.MASTER_MANAGE });
  if (!actor) throw ApiError.badRequest('No active Master Admin to attribute these changes to', 'NO_SYSTEM_ACTOR');

  const manager = await User.findOne({ organizationId: fromSite.organizationId, email: managerEmail.toLowerCase().trim() });
  if (!manager) throw ApiError.notFound(`User "${managerEmail}" not found`);

  const steps = {};

  // 1. Close the old site's open period (if any), frozen balance, no carry-forward.
  let leftoverPaise = 0;
  if (fromSite.status === 'ACTIVE') {
    const account = await fundService.getActiveFundAccount(fromSite._id, fromSite.organizationId);
    const period = account && (await fundService.getOpenPeriod(account._id));
    if (period) {
      const blocking = await Expense.countDocuments({
        siteId: fromSite._id,
        status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.RETURNED] },
      });
      if (blocking > 0) {
        throw ApiError.conflict(`${fromSiteName} has ${blocking} pending/returned expense(s) — clear those before migrating`, 'PENDING_ITEMS_EXIST');
      }
      const balance = await fundService.computeBalance(period._id);
      leftoverPaise = Math.max(0, balance.available);
      await fundService.closePeriod({ fundPeriodId: period._id, userId: actor._id, reason: `Closed — site migrated to ${toSiteName}`, carryForward: false });
      steps.closedPeriod = { periodId: period._id, leftoverPaise };
    } else {
      steps.closedPeriod = 'NO_OPEN_PERIOD';
    }

    // 2. Deactivate the old site.
    fromSite.status = 'INACTIVE';
    fromSite.updatedBy = actor._id;
    await fromSite.save();
    steps.deactivatedFromSite = true;
  } else {
    steps.deactivatedFromSite = 'ALREADY_INACTIVE';
  }

  // 3. Create the new site (no history).
  let toSite = await Site.findOne({ organizationId: fromSite.organizationId, code: toCode.toUpperCase() });
  if (!toSite) {
    toSite = await Site.create({
      organizationId: fromSite.organizationId,
      code: toCode.toUpperCase(),
      name: toSiteName,
      status: 'ACTIVE',
      createdBy: actor._id,
      updatedBy: actor._id,
    });
    steps.createdToSite = toSite._id;
  } else {
    steps.createdToSite = 'ALREADY_EXISTS';
  }

  // 4. Open its fund account/period with the migrated balance, if any and
  // if it doesn't already have an open period (re-run safety).
  const existingToAccount = await fundService.getActiveFundAccount(toSite._id, toSite.organizationId);
  const existingToPeriod = existingToAccount && (await fundService.getOpenPeriod(existingToAccount._id));
  if (!existingToPeriod && leftoverPaise > 0) {
    const newPeriod = await fundService.createOpeningAllocation({
      organizationId: toSite.organizationId,
      siteId: toSite._id,
      amountPaise: leftoverPaise,
      label: `Opening — migrated from ${fromSiteName}`,
      startDate: new Date(),
      userId: actor._id,
    });
    steps.openedToPeriod = { periodId: newPeriod._id, amountPaise: leftoverPaise };
  } else {
    steps.openedToPeriod = existingToPeriod ? 'ALREADY_OPEN' : 'NOTHING_TO_MIGRATE';
  }

  // 5. Move the manager's site assignment from the old site to the new one.
  await SiteUserAssignment.updateOne(
    { organizationId: fromSite.organizationId, userId: manager._id, siteId: fromSite._id },
    { $set: { isActive: false, effectiveEnd: new Date() } }
  );
  await SiteUserAssignment.findOneAndUpdate(
    { organizationId: toSite.organizationId, userId: manager._id, siteId: toSite._id },
    { $set: { isActive: true, effectiveEnd: null }, $setOnInsert: { effectiveStart: new Date(), createdBy: actor._id } },
    { upsert: true }
  );
  steps.reassignedManager = { userId: manager._id, fromSiteId: fromSite._id, toSiteId: toSite._id };

  res.json({ fixed: true, toSiteId: toSite._id, steps });
});

module.exports = {
  runMonthlyRolloverForAllOrganizations,
  runMonthEndSummaryForAllOrganizations,
  deleteTestExpense,
  renameSite,
  siteStatus,
  closeSiteAndMigrate,
};
