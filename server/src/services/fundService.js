const mongoose = require('mongoose');
const FundAccount = require('../models/FundAccount');
const FundPeriod = require('../models/FundPeriod');
const FundLedgerEntry = require('../models/FundLedgerEntry');
const Expense = require('../models/Expense');
const Site = require('../models/Site');
const ExpensePolicy = require('../models/ExpensePolicy');
const ApiError = require('../utils/ApiError');
const { LEDGER_ENTRY_TYPE, FUND_PERIOD_STATUS, EXPENSE_STATUS } = require('../config/constants');
const { recordAudit } = require('./auditService');

// Lives here (not expenseService) so both expenseService and this file's own
// rollover logic can use it without a require() cycle between the two
// services.
async function getEffectivePolicy(organizationId, siteId) {
  const sitePolicy = await ExpensePolicy.findOne({ organizationId, siteId });
  if (sitePolicy) return sitePolicy;
  return ExpensePolicy.findOne({ organizationId, siteId: null });
}

const FUNDED_TYPES = [LEDGER_ENTRY_TYPE.OPENING_ALLOCATION, LEDGER_ENTRY_TYPE.TOP_UP, LEDGER_ENTRY_TYPE.CARRY_FORWARD];

// Single source of truth for balances: everything is derived from the
// append-only ledger + live expense statuses, never from a stored running total.
async function computeBalance(fundPeriodId) {
  const rows = await FundLedgerEntry.aggregate([
    { $match: { fundPeriodId: new mongoose.Types.ObjectId(fundPeriodId) } },
    { $group: { _id: '$type', total: { $sum: '$amountPaise' }, positiveTotal: { $sum: { $cond: [{ $gt: ['$amountPaise', 0] }, '$amountPaise', 0] } } } },
  ]);

  let available = 0;
  let funded = 0;
  let postedSpend = 0;
  let reversed = 0;

  for (const row of rows) {
    available += row.total;
    if (FUNDED_TYPES.includes(row._id)) funded += row.total;
    if (row._id === LEDGER_ENTRY_TYPE.ADJUSTMENT) funded += row.positiveTotal;
    if (row._id === LEDGER_ENTRY_TYPE.EXPENSE_POSTED) postedSpend += -row.total;
    if (row._id === LEDGER_ENTRY_TYPE.EXPENSE_REVERSAL) reversed += row.total;
  }
  // Named approvedSpend for the existing dashboard/report labels, but it's
  // really "posted spend": since rejectExpense also posts an EXPENSE_POSTED
  // deduction (the money was already spent regardless of the review
  // outcome), this total includes rejected-but-deducted amounts too, not
  // only APPROVED ones. That's intentional — it reflects real cash out.
  const approvedSpend = postedSpend - reversed;

  const pendingAgg = await Expense.aggregate([
    { $match: { fundPeriodId: new mongoose.Types.ObjectId(fundPeriodId), status: EXPENSE_STATUS.PENDING_APPROVAL } },
    { $group: { _id: null, total: { $sum: '$amountPaise' } } },
  ]);
  const pending = pendingAgg[0]?.total || 0;

  return {
    funded,
    approvedSpend,
    available,
    pending,
    projectedAvailable: available - pending,
  };
}

async function getActiveFundAccount(siteId, organizationId) {
  let account = await FundAccount.findOne({ siteId, organizationId, status: 'ACTIVE' });
  return account;
}

async function getOpenPeriod(fundAccountId) {
  return FundPeriod.findOne({ fundAccountId, status: { $in: [FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED] } });
}

async function createOpeningAllocation({ organizationId, siteId, amountPaise, label, startDate, userId, req }) {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw ApiError.badRequest('Opening allocation must be a positive amount', 'INVALID_AMOUNT');
  }
  const session = await mongoose.startSession();
  try {
    let period;
    await session.withTransaction(async () => {
      let account = await FundAccount.findOne({ siteId, organizationId, status: 'ACTIVE' }).session(session);
      if (!account) {
        [account] = await FundAccount.create([{ organizationId, siteId, createdBy: userId }], { session });
      }
      const existingOpen = await FundPeriod.findOne({
        fundAccountId: account._id,
        status: { $in: [FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED] },
      }).session(session);
      if (existingOpen) {
        throw ApiError.conflict('An open fund period already exists for this site. Close it before opening a new one.', 'PERIOD_ALREADY_OPEN');
      }
      [period] = await FundPeriod.create(
        [{ organizationId, siteId, fundAccountId: account._id, label, startDate, status: FUND_PERIOD_STATUS.OPEN, openedBy: userId }],
        { session }
      );
      await FundLedgerEntry.create(
        [
          {
            organizationId,
            siteId,
            fundAccountId: account._id,
            fundPeriodId: period._id,
            type: LEDGER_ENTRY_TYPE.OPENING_ALLOCATION,
            amountPaise,
            createdBy: userId,
          },
        ],
        { session }
      );
      await recordAudit({
        organizationId,
        actorId: userId,
        action: 'FUND_OPENING_ALLOCATION',
        entityType: 'FundPeriod',
        entityId: period._id,
        after: { amountPaise, label },
        req,
        session,
      });
    });
    return period;
  } finally {
    session.endSession();
  }
}

async function addLedgerMovement({ organizationId, siteId, fundPeriodId, type, amountPaise, reason, userId, idempotencyKey, req, requireNonNegativeResult = false }) {
  const session = await mongoose.startSession();
  try {
    let entry;
    await session.withTransaction(async () => {
      const period = await FundPeriod.findById(fundPeriodId).session(session);
      if (!period) throw ApiError.notFound('Fund period not found');
      if (![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(period.status)) {
        throw ApiError.conflict('Fund period is closed', 'PERIOD_CLOSED');
      }
      if (idempotencyKey) {
        const dupe = await FundLedgerEntry.findOne({ idempotencyKey }).session(session);
        if (dupe) {
          entry = dupe;
          return;
        }
      }
      if (requireNonNegativeResult) {
        const balance = await computeBalance(fundPeriodId);
        if (balance.available + amountPaise < 0) {
          throw ApiError.conflict('This adjustment would make the available balance negative', 'INSUFFICIENT_BALANCE');
        }
      }
      const [created] = await FundLedgerEntry.create(
        [{ organizationId, siteId, fundAccountId: period.fundAccountId, fundPeriodId, type, amountPaise, reason, createdBy: userId, idempotencyKey }],
        { session }
      );
      entry = created;
      await recordAudit({
        organizationId,
        actorId: userId,
        action: `FUND_${type}`,
        entityType: 'FundLedgerEntry',
        entityId: entry._id,
        after: { amountPaise, reason },
        reason,
        req,
        session,
      });
    });
    return entry;
  } finally {
    session.endSession();
  }
}

async function closePeriod({ fundPeriodId, userId, reason, carryForward, req }) {
  const session = await mongoose.startSession();
  try {
    let newPeriod = null;
    await session.withTransaction(async () => {
      const period = await FundPeriod.findById(fundPeriodId).session(session);
      if (!period) throw ApiError.notFound('Fund period not found');
      if (![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(period.status)) {
        throw ApiError.conflict('Fund period is already closed', 'PERIOD_ALREADY_CLOSED');
      }
      const pendingCount = await Expense.countDocuments({
        fundPeriodId,
        status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.RETURNED] },
      }).session(session);
      if (pendingCount > 0) {
        throw ApiError.conflict('Cannot close a period with pending or returned expenses', 'PENDING_ITEMS_EXIST');
      }
      const balance = await computeBalance(fundPeriodId);
      period.status = FUND_PERIOD_STATUS.CLOSED;
      period.closedBy = userId;
      period.closedAt = new Date();
      period.endDate = new Date();
      period.reconciliationNotes = reason || '';
      await period.save({ session });

      if (carryForward && balance.available > 0) {
        const nextLabel = `${period.label}-CF`;
        [newPeriod] = await FundPeriod.create(
          [
            {
              organizationId: period.organizationId,
              siteId: period.siteId,
              fundAccountId: period.fundAccountId,
              label: nextLabel,
              startDate: new Date(),
              status: FUND_PERIOD_STATUS.OPEN,
              carryForwardFromPeriodId: period._id,
              openedBy: userId,
            },
          ],
          { session }
        );
        await FundLedgerEntry.create(
          [
            {
              organizationId: period.organizationId,
              siteId: period.siteId,
              fundAccountId: period.fundAccountId,
              fundPeriodId: newPeriod._id,
              type: LEDGER_ENTRY_TYPE.CARRY_FORWARD,
              amountPaise: balance.available,
              reason: `Carried forward from ${period.label}`,
              createdBy: userId,
            },
          ],
          { session }
        );
      }
      await recordAudit({
        organizationId: period.organizationId,
        actorId: userId,
        action: 'FUND_PERIOD_CLOSE',
        entityType: 'FundPeriod',
        entityId: period._id,
        after: { reason, carryForward, availableAtClose: balance.available },
        reason,
        req,
        session,
      });
    });
    return newPeriod;
  } finally {
    session.endSession();
  }
}

async function reopenPeriod({ fundPeriodId, userId, req }) {
  const period = await FundPeriod.findById(fundPeriodId);
  if (!period) throw ApiError.notFound('Fund period not found');
  if (period.status !== FUND_PERIOD_STATUS.CLOSED) {
    throw ApiError.conflict('Only a closed period can be reopened', 'PERIOD_NOT_CLOSED');
  }
  period.status = FUND_PERIOD_STATUS.REOPENED;
  period.reopenedBy = userId;
  period.reopenedAt = new Date();
  await period.save();
  await recordAudit({
    organizationId: period.organizationId,
    actorId: userId,
    action: 'FUND_PERIOD_REOPEN',
    entityType: 'FundPeriod',
    entityId: period._id,
    req,
  });
  return period;
}

function monthLabel(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Rolls one site's fund forward into the current calendar month: whatever
// was left in the old period carries forward (even if zero or negative —
// unlike a manual close, automation must never leave a site with no open
// period), and the site's configured fixed monthly amount is added on top.
// Distinct from closePeriod() (which only carries forward a positive balance,
// and only when a human explicitly asks it to) because unattended automation
// must guarantee continuity: there's no Master watching to open the next
// period by hand if this run skipped it.
async function rolloverPeriod({ period, monthlyAllocationPaise, userId, label }) {
  const session = await mongoose.startSession();
  try {
    let newPeriod = null;
    let outcome = null;
    await session.withTransaction(async () => {
      const fresh = await FundPeriod.findById(period._id).session(session);
      if (!fresh || ![FUND_PERIOD_STATUS.OPEN, FUND_PERIOD_STATUS.REOPENED].includes(fresh.status)) {
        outcome = 'ALREADY_CLOSED';
        return;
      }
      const pendingCount = await Expense.countDocuments({
        fundPeriodId: fresh._id,
        status: { $in: [EXPENSE_STATUS.PENDING_APPROVAL, EXPENSE_STATUS.RETURNED] },
      }).session(session);
      if (pendingCount > 0) {
        outcome = 'PENDING_ITEMS_EXIST';
        return;
      }

      const balance = await computeBalance(fresh._id);
      fresh.status = FUND_PERIOD_STATUS.CLOSED;
      fresh.closedBy = userId;
      fresh.closedAt = new Date();
      fresh.endDate = new Date();
      fresh.reconciliationNotes = 'Closed automatically by monthly rollover';
      await fresh.save({ session });

      [newPeriod] = await FundPeriod.create(
        [
          {
            organizationId: fresh.organizationId,
            siteId: fresh.siteId,
            fundAccountId: fresh.fundAccountId,
            label,
            startDate: new Date(),
            status: FUND_PERIOD_STATUS.OPEN,
            carryForwardFromPeriodId: fresh._id,
            openedBy: userId,
          },
        ],
        { session }
      );

      if (balance.available !== 0) {
        await FundLedgerEntry.create(
          [
            {
              organizationId: fresh.organizationId,
              siteId: fresh.siteId,
              fundAccountId: fresh.fundAccountId,
              fundPeriodId: newPeriod._id,
              type: LEDGER_ENTRY_TYPE.CARRY_FORWARD,
              amountPaise: balance.available,
              reason: `Carried forward from ${fresh.label}`,
              createdBy: userId,
            },
          ],
          { session }
        );
      }
      if (monthlyAllocationPaise > 0) {
        await FundLedgerEntry.create(
          [
            {
              organizationId: fresh.organizationId,
              siteId: fresh.siteId,
              fundAccountId: fresh.fundAccountId,
              fundPeriodId: newPeriod._id,
              type: LEDGER_ENTRY_TYPE.TOP_UP,
              amountPaise: monthlyAllocationPaise,
              reason: `Monthly allocation — ${label}`,
              createdBy: userId,
            },
          ],
          { session }
        );
      }

      await recordAudit({
        organizationId: fresh.organizationId,
        actorId: userId,
        action: 'FUND_MONTHLY_ROLLOVER',
        entityType: 'FundPeriod',
        entityId: newPeriod._id,
        after: { carriedForward: balance.available, monthlyAllocationPaise, label },
        session,
      });
      outcome = 'ROLLED_OVER';
    });
    return { outcome, newPeriod };
  } finally {
    session.endSession();
  }
}

// Entry point for both the manual "Run Rollover Now" button and the
// external scheduled trigger. Idempotent to call repeatedly within the same
// month: a site whose open period already carries this month's label is
// left untouched.
async function rolloverDueSites({ organizationId, userId, now = new Date() }) {
  const label = monthLabel(now);
  const sites = await Site.find({ organizationId, status: 'ACTIVE' }).lean();
  const results = [];

  for (const site of sites) {
    const policy = await getEffectivePolicy(organizationId, site._id);
    const monthlyAllocationPaise = policy?.defaultAllocationPaise || 0;
    if (monthlyAllocationPaise <= 0) {
      results.push({ site: site.name, outcome: 'SKIPPED_NO_MONTHLY_AMOUNT' });
      continue;
    }

    const account = await getActiveFundAccount(site._id, organizationId);
    if (!account) {
      const period = await createOpeningAllocation({ organizationId, siteId: site._id, amountPaise: monthlyAllocationPaise, label, startDate: now, userId });
      results.push({ site: site.name, outcome: 'OPENED', periodId: period._id, label });
      continue;
    }

    const openPeriod = await getOpenPeriod(account._id);
    if (!openPeriod) {
      const period = await createOpeningAllocation({ organizationId, siteId: site._id, amountPaise: monthlyAllocationPaise, label, startDate: now, userId });
      results.push({ site: site.name, outcome: 'OPENED', periodId: period._id, label });
      continue;
    }
    if (openPeriod.label === label) {
      results.push({ site: site.name, outcome: 'ALREADY_CURRENT', periodId: openPeriod._id, label });
      continue;
    }

    const { outcome, newPeriod } = await rolloverPeriod({ period: openPeriod, monthlyAllocationPaise, userId, label });
    results.push({ site: site.name, outcome, periodId: newPeriod?._id, label });
  }

  return results;
}

module.exports = {
  computeBalance,
  getActiveFundAccount,
  getOpenPeriod,
  getEffectivePolicy,
  monthLabel,
  rolloverDueSites,
  createOpeningAllocation,
  addLedgerMovement,
  closePeriod,
  reopenPeriod,
};
