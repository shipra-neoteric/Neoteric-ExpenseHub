const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const ExpenseCategory = require('../models/ExpenseCategory');
const ExpenseApprovalAction = require('../models/ExpenseApprovalAction');
const ExpenseAttachment = require('../models/ExpenseAttachment');
const Site = require('../models/Site');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { EXPENSE_STATUS, FUND_PERIOD_STATUS, LEDGER_ENTRY_TYPE, OVERDRAW_BEHAVIOR } = require('../config/constants');
const { nextExpenseNumber } = require('./numberingService');
const { recordAudit } = require('./auditService');
const fundService = require('./fundService');
const { getEffectivePolicy } = fundService;
const slackService = require('./slackService');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const FundPeriod = require('../models/FundPeriod');

function normalize(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function findLikelyDuplicates({ organizationId, siteId, expenseDate, amountPaise, description, merchant, excludeId }) {
  const dayStart = new Date(expenseDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const candidates = await Expense.find({
    organizationId,
    siteId,
    expenseDate: { $gte: dayStart, $lt: dayEnd },
    amountPaise,
    status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.RETURNED] },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).lean();

  const normDesc = normalize(description);
  const normMerchant = normalize(merchant);
  return candidates.filter((c) => normalize(c.description) === normDesc && normalize(c.merchant) === normMerchant);
}

async function createDraft({ organizationId, siteId, userId, payload, req }) {
  const site = await Site.findOne({ _id: siteId, organizationId, status: 'ACTIVE' });
  if (!site) throw ApiError.badRequest('Site is not active', 'SITE_INACTIVE');

  const category = await ExpenseCategory.findOne({ _id: payload.categoryId, organizationId, isActive: true });
  if (!category) throw ApiError.badRequest('Category is not active', 'CATEGORY_INACTIVE');

  const fundAccount = await fundService.getActiveFundAccount(siteId, organizationId);
  if (!fundAccount) throw ApiError.conflict('No active fund account for this site. Ask Master to open a fund.', 'NO_FUND_ACCOUNT');
  const period = await fundService.getOpenPeriod(fundAccount._id);
  if (!period) throw ApiError.conflict('No open fund period for this site.', 'NO_OPEN_PERIOD');

  const expenseNumber = await nextExpenseNumber(organizationId);

  const expense = await Expense.create({
    organizationId,
    siteId,
    fundAccountId: fundAccount._id,
    fundPeriodId: period._id,
    expenseNumber,
    status: EXPENSE_STATUS.DRAFT,
    expenseDate: payload.expenseDate,
    categoryId: category._id,
    categorySnapshot: { name: category.name, code: category.code },
    description: payload.description,
    merchant: payload.merchant || '',
    amountPaise: payload.amountPaise,
    paymentMode: payload.paymentMode,
    paidByUserId: payload.paidByUserId || userId,
    notes: payload.notes || '',
    idempotencyKey: payload.idempotencyKey || null,
    createdBy: userId,
    updatedBy: userId,
  });

  await ExpenseApprovalAction.create({
    organizationId,
    expenseId: expense._id,
    action: 'CREATE_DRAFT',
    actorId: userId,
    toStatus: EXPENSE_STATUS.DRAFT,
  });
  await recordAudit({ organizationId, actorId: userId, action: 'EXPENSE_CREATE_DRAFT', entityType: 'Expense', entityId: expense._id, after: expense.toObject(), req });

  return expense;
}

async function assertEditable(expense) {
  if (![EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.RETURNED].includes(expense.status)) {
    throw ApiError.conflict('Only draft or returned expenses can be edited', 'NOT_EDITABLE');
  }
}

async function updateExpense({ expense, userId, payload, expectedVersion, req }) {
  await assertEditable(expense);
  if (expectedVersion !== undefined && expense.version !== expectedVersion) {
    throw ApiError.conflict('This expense was changed elsewhere. Reload and try again.', 'VERSION_CONFLICT');
  }
  const before = expense.toObject();

  if (payload.categoryId && String(payload.categoryId) !== String(expense.categoryId)) {
    const category = await ExpenseCategory.findOne({ _id: payload.categoryId, organizationId: expense.organizationId, isActive: true });
    if (!category) throw ApiError.badRequest('Category is not active', 'CATEGORY_INACTIVE');
    expense.categoryId = category._id;
    expense.categorySnapshot = { name: category.name, code: category.code };
  }
  if (payload.expenseDate) expense.expenseDate = payload.expenseDate;
  if (payload.description) expense.description = payload.description;
  if (payload.merchant !== undefined) expense.merchant = payload.merchant;
  if (payload.amountPaise) expense.amountPaise = payload.amountPaise;
  if (payload.paymentMode) expense.paymentMode = payload.paymentMode;
  if (payload.paidByUserId) expense.paidByUserId = payload.paidByUserId;
  if (payload.notes !== undefined) expense.notes = payload.notes;
  expense.version += 1;
  expense.updatedBy = userId;
  await expense.save();

  await ExpenseApprovalAction.create({ organizationId: expense.organizationId, expenseId: expense._id, action: 'EDIT', actorId: userId, fromStatus: before.status, toStatus: expense.status });
  await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_EDIT', entityType: 'Expense', entityId: expense._id, before, after: expense.toObject(), req });
  return expense;
}

async function submitExpense({ expense, userId, duplicateOverrideReason, req }) {
  if (![EXPENSE_STATUS.DRAFT, EXPENSE_STATUS.RETURNED].includes(expense.status)) {
    throw ApiError.conflict('Only draft or returned expenses can be submitted', 'NOT_SUBMITTABLE');
  }
  const wasReturned = expense.status === EXPENSE_STATUS.RETURNED;

  const period = await FundPeriod.findById(expense.fundPeriodId);
  if (!period || ![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(period.status)) {
    throw ApiError.conflict('Fund period is closed', 'PERIOD_CLOSED');
  }

  const policy = await getEffectivePolicy(expense.organizationId, expense.siteId);
  if (policy) {
    if (!policy.allowedPaymentModes.includes(expense.paymentMode)) {
      throw ApiError.badRequest('Payment mode not allowed by policy', 'PAYMENT_MODE_NOT_ALLOWED');
    }
    const now = new Date();
    const backdateLimitMs = (policy.backdateLimitDays ?? 7) * 24 * 60 * 60 * 1000;
    if (now - expense.expenseDate > backdateLimitMs) {
      throw ApiError.badRequest('Expense date is beyond the allowed backdating window', 'BACKDATE_LIMIT_EXCEEDED');
    }
  }
  if (expense.expenseDate > new Date()) {
    throw ApiError.badRequest('Expense date cannot be in the future', 'FUTURE_DATE_NOT_ALLOWED');
  }

  // A receipt is unconditionally required to submit — not gated by category
  // or amount. (Category/policy receipt-rule fields still exist for
  // reporting/future use, but no longer gate the hard requirement below.)
  const receiptCount = await ExpenseAttachment.countDocuments({ expenseId: expense._id, removedAt: null });
  if (receiptCount === 0) {
    throw ApiError.badRequest('A receipt is required to submit this expense', 'RECEIPT_REQUIRED');
  }

  if (!duplicateOverrideReason) {
    const dupes = await findLikelyDuplicates({
      organizationId: expense.organizationId,
      siteId: expense.siteId,
      expenseDate: expense.expenseDate,
      amountPaise: expense.amountPaise,
      description: expense.description,
      merchant: expense.merchant,
      excludeId: expense._id,
    });
    if (dupes.length > 0) {
      throw ApiError.conflict('A very similar expense already exists for this site/date/amount', 'POSSIBLE_DUPLICATE', {
        matches: dupes.map((d) => ({ id: d._id, expenseNumber: d.expenseNumber, status: d.status })),
      });
    }
  }

  const overdrawBehavior = policy?.overdrawBehavior || OVERDRAW_BEHAVIOR.BLOCK;
  if (overdrawBehavior === OVERDRAW_BEHAVIOR.BLOCK) {
    const balance = await fundService.computeBalance(expense.fundPeriodId);
    if (balance.available - balance.pending - expense.amountPaise < 0) {
      throw ApiError.conflict('Insufficient available balance for this expense', 'INSUFFICIENT_BALANCE');
    }
  }

  const before = expense.toObject();
  expense.status = EXPENSE_STATUS.PENDING_APPROVAL;
  expense.submittedAt = new Date();
  expense.duplicateOverrideReason = duplicateOverrideReason || null;
  expense.version += 1;
  expense.updatedBy = userId;
  await expense.save();

  await ExpenseApprovalAction.create({
    organizationId: expense.organizationId,
    expenseId: expense._id,
    action: wasReturned ? 'RESUBMIT' : 'SUBMIT',
    actorId: userId,
    reason: duplicateOverrideReason || '',
    fromStatus: before.status,
    toStatus: expense.status,
  });
  await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_SUBMIT', entityType: 'Expense', entityId: expense._id, before, after: expense.toObject(), req });

  // Best-effort notification — Slack being unreachable/misconfigured must
  // never fail a real submission, so this runs after the transaction has
  // already committed and any error here is only logged, not thrown.
  notifyApproversOnSlack(expense).catch((err) => console.error('[slack] approval notification failed', err));

  return expense;
}

// Logs every outcome, including the quiet ones — the caller only sees
// failures via .catch(), so a skip (unconfigured, no approvers listed, no
// active approver) or even a clean success would otherwise leave zero trace,
// making "why didn't the DM arrive?" impossible to diagnose from logs alone.
async function notifyApproversOnSlack(expense) {
  const tag = `[slack] ${expense.expenseNumber}`;
  if (!slackService.isConfigured()) {
    console.log(`${tag}: skipped — SLACK_BOT_TOKEN/SLACK_SIGNING_SECRET not set`);
    return;
  }

  const policy = await getEffectivePolicy(expense.organizationId, expense.siteId);
  const approverIds = policy?.approverUserIds || [];
  if (approverIds.length === 0) {
    console.log(`${tag}: skipped — no approverUserIds on the effective policy for this site`);
    return;
  }

  const [approvers, site, attachment] = await Promise.all([
    User.find({ _id: { $in: approverIds }, isActive: true }),
    Site.findById(expense.siteId).lean(),
    ExpenseAttachment.findOne({ expenseId: expense._id, removedAt: null }).sort({ createdAt: 1 }),
  ]);
  if (approvers.length === 0) {
    console.log(`${tag}: skipped — none of the ${approverIds.length} configured approver(s) are active users`);
    return;
  }
  const withoutSlackEmail = approvers.filter((a) => !a.slackEmail);
  if (withoutSlackEmail.length) {
    console.log(`${tag}: ${withoutSlackEmail.map((a) => a.name).join(', ')} has/have no slackEmail set — will be skipped`);
  }

  const outcome = await slackService.sendApprovalRequest({ expense, siteName: site?.name || '', approvers, attachment });
  console.log(`${tag}: send result`, JSON.stringify(outcome));
}

async function approveExpense({ expenseId, userId, allowSelfApprovalOverride, req }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const expense = await Expense.findById(expenseId).session(session);
      if (!expense) throw ApiError.notFound('Expense not found');
      if (expense.status !== EXPENSE_STATUS.PENDING_APPROVAL) {
        throw ApiError.conflict('Expense was already actioned', 'NOT_PENDING');
      }
      const policy = await getEffectivePolicy(expense.organizationId, expense.siteId);
      const allowSelfApproval = allowSelfApprovalOverride ?? policy?.allowSelfApproval ?? false;
      if (!allowSelfApproval && String(expense.createdBy) === String(userId)) {
        throw ApiError.forbidden('You cannot approve your own expense', 'SELF_APPROVAL_DENIED');
      }
      const period = await FundPeriod.findById(expense.fundPeriodId).session(session);
      if (!period || ![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(period.status)) {
        throw ApiError.conflict('Fund period is closed', 'PERIOD_CLOSED');
      }
      const balance = await fundService.computeBalance(expense.fundPeriodId);
      const overdrawBehavior = policy?.overdrawBehavior || OVERDRAW_BEHAVIOR.BLOCK;
      if (overdrawBehavior === OVERDRAW_BEHAVIOR.BLOCK && balance.available - expense.amountPaise < 0) {
        throw ApiError.conflict('Insufficient available balance to approve this expense', 'INSUFFICIENT_BALANCE');
      }

      const before = expense.toObject();
      const [ledgerEntry] = await FundLedgerEntry.create(
        [
          {
            organizationId: expense.organizationId,
            siteId: expense.siteId,
            fundAccountId: expense.fundAccountId,
            fundPeriodId: expense.fundPeriodId,
            type: LEDGER_ENTRY_TYPE.EXPENSE_POSTED,
            amountPaise: -expense.amountPaise,
            relatedExpenseId: expense._id,
            createdBy: userId,
          },
        ],
        { session }
      );

      expense.status = EXPENSE_STATUS.APPROVED;
      expense.approvedAt = new Date();
      expense.approvedBy = userId;
      expense.ledgerEntryId = ledgerEntry._id;
      expense.version += 1;
      expense.updatedBy = userId;
      await expense.save({ session });

      await ExpenseApprovalAction.create([{ organizationId: expense.organizationId, expenseId: expense._id, action: 'APPROVE', actorId: userId, fromStatus: before.status, toStatus: expense.status }], { session });
      await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_APPROVE', entityType: 'Expense', entityId: expense._id, before, after: expense.toObject(), req, session });
      result = expense;
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function returnExpense({ expenseId, userId, reason, req }) {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.PENDING_APPROVAL) throw ApiError.conflict('Only pending expenses can be returned', 'NOT_PENDING');
  if (!reason?.trim()) throw ApiError.badRequest('A reason is required', 'REASON_REQUIRED');

  const before = expense.toObject();
  expense.status = EXPENSE_STATUS.RETURNED;
  expense.returnedAt = new Date();
  expense.returnReason = reason.trim();
  expense.version += 1;
  expense.updatedBy = userId;
  await expense.save();

  await ExpenseApprovalAction.create({ organizationId: expense.organizationId, expenseId: expense._id, action: 'RETURN', actorId: userId, reason, fromStatus: before.status, toStatus: expense.status });
  await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_RETURN', entityType: 'Expense', entityId: expense._id, before, after: expense.toObject(), reason, req });
  return expense;
}

// Rejecting still posts a real ledger deduction: the money was already spent
// by the front desk in the real world (they hold cash/UPI proof, not a
// pending claim), so a rejection is a judgment that the expense wasn't a
// legitimate business cost — not proof the cash never left the register.
// The expense's status stays REJECTED (for accountability/audit) while the
// fund balance reflects reality. A rejected-and-deducted expense can later be
// reversed via voidExpense, exactly like an approved one, if it turns out to
// be a mistake.
async function rejectExpense({ expenseId, userId, reason, req }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const expense = await Expense.findById(expenseId).session(session);
      if (!expense) throw ApiError.notFound('Expense not found');
      if (expense.status !== EXPENSE_STATUS.PENDING_APPROVAL) throw ApiError.conflict('Only pending expenses can be rejected', 'NOT_PENDING');
      if (!reason?.trim()) throw ApiError.badRequest('A reason is required', 'REASON_REQUIRED');

      const before = expense.toObject();
      const [ledgerEntry] = await FundLedgerEntry.create(
        [
          {
            organizationId: expense.organizationId,
            siteId: expense.siteId,
            fundAccountId: expense.fundAccountId,
            fundPeriodId: expense.fundPeriodId,
            type: LEDGER_ENTRY_TYPE.EXPENSE_POSTED,
            amountPaise: -expense.amountPaise,
            relatedExpenseId: expense._id,
            reason: `Rejected but deducted (already spent): ${reason.trim()}`,
            createdBy: userId,
          },
        ],
        { session }
      );

      expense.status = EXPENSE_STATUS.REJECTED;
      expense.rejectedAt = new Date();
      expense.rejectReason = reason.trim();
      expense.ledgerEntryId = ledgerEntry._id;
      expense.version += 1;
      expense.updatedBy = userId;
      await expense.save({ session });

      await ExpenseApprovalAction.create([{ organizationId: expense.organizationId, expenseId: expense._id, action: 'REJECT', actorId: userId, reason, fromStatus: before.status, toStatus: expense.status }], { session });
      await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_REJECT', entityType: 'Expense', entityId: expense._id, before, after: expense.toObject(), reason, req, session });
      result = expense;
    });
    return result;
  } finally {
    session.endSession();
  }
}

// Reverses the fund deduction for either an APPROVED or a REJECTED-but-deducted
// expense — both have a ledgerEntryId pointing at the EXPENSE_POSTED entry
// that took the money out, so both use the same reversal path.
async function voidExpense({ expenseId, userId, reason, req }) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const expense = await Expense.findById(expenseId).session(session);
      if (!expense) throw ApiError.notFound('Expense not found');
      if (![EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.REJECTED].includes(expense.status) || !expense.ledgerEntryId) {
        throw ApiError.conflict('Only an approved or a rejected-and-deducted expense can be voided', 'NOT_VOIDABLE');
      }
      if (!reason?.trim()) throw ApiError.badRequest('A reason is required', 'REASON_REQUIRED');

      const before = expense.toObject();
      const [reversal] = await FundLedgerEntry.create(
        [
          {
            organizationId: expense.organizationId,
            siteId: expense.siteId,
            fundAccountId: expense.fundAccountId,
            fundPeriodId: expense.fundPeriodId,
            type: LEDGER_ENTRY_TYPE.EXPENSE_REVERSAL,
            amountPaise: expense.amountPaise,
            relatedExpenseId: expense._id,
            reason,
            createdBy: userId,
          },
        ],
        { session }
      );

      expense.status = EXPENSE_STATUS.VOIDED;
      expense.voidedAt = new Date();
      expense.voidedBy = userId;
      expense.voidReason = reason.trim();
      expense.reversalLedgerEntryId = reversal._id;
      expense.version += 1;
      expense.updatedBy = userId;
      await expense.save({ session });

      await ExpenseApprovalAction.create([{ organizationId: expense.organizationId, expenseId: expense._id, action: 'VOID', actorId: userId, reason, fromStatus: before.status, toStatus: expense.status }], { session });
      await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_VOID', entityType: 'Expense', entityId: expense._id, before, after: expense.toObject(), reason, req, session });
      result = expense;
    });
    return result;
  } finally {
    session.endSession();
  }
}

async function deleteDraft({ expenseId, userId, req }) {
  const expense = await Expense.findById(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (expense.status !== EXPENSE_STATUS.DRAFT) throw ApiError.conflict('Only drafts can be deleted', 'NOT_DRAFT');
  await ExpenseApprovalAction.create({ organizationId: expense.organizationId, expenseId: expense._id, action: 'DELETE_DRAFT', actorId: userId, fromStatus: expense.status, toStatus: expense.status });
  await recordAudit({ organizationId: expense.organizationId, actorId: userId, action: 'EXPENSE_DELETE_DRAFT', entityType: 'Expense', entityId: expense._id, before: expense.toObject(), req });
  await expense.deleteOne();
}

module.exports = {
  createDraft,
  updateExpense,
  submitExpense,
  approveExpense,
  returnExpense,
  rejectExpense,
  voidExpense,
  deleteDraft,
  findLikelyDuplicates,
  getEffectivePolicy,
};
